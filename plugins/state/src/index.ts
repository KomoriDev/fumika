import type { Link } from '@fumika/link'
import type {
  AppStateGetReply,
  AppStateUpdatePayload,
  AppStateUpdateReply,
  Mutation,
} from '@fumika/state'
import type { Context } from 'cordis'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  apply,
  cloneState,
  DeltaState,
  resolveState,
  StateService,
} from '@fumika/state'
import { Service } from 'cordis'

export interface Config {
  file: string
  flushDebounce?: number
}

export class BackendStateService extends StateService {
  static inject = ['link']

  private readonly deltaState = new DeltaState()
  private readonly file: string
  private readonly flushDebounce: number
  private flushTimer?: ReturnType<typeof setTimeout>

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.file = config.file
    this.flushDebounce = config.flushDebounce ?? 200
  }

  private get link(): Link {
    return this.ctx.link
  }

  async* [Service.init]() {
    await this.load()

    yield this.link.action('app-state.get', (): AppStateGetReply => ({
      state: this.snapshot(),
      cursor: this.deltaState.snapshot(),
      updatedAt: Date.now(),
    }))

    yield this.link.action('app-state.update', (payload: AppStateUpdatePayload): AppStateUpdateReply => {
      const mutation = this.deltaState.load(payload.delta as never)
      apply(this.data, mutation)
      this.commit(mutation, payload.source)
      return {
        ok: true,
        cursor: this.deltaState.snapshot(),
      }
    })

    yield async () => {
      clearTimeout(this.flushTimer)
      this.flushTimer = undefined
      await this.flush()
    }
  }

  protected onMutate(mutation: Mutation): void {
    this.commit(mutation)
  }

  private commit(mutation: Mutation, source?: string): void {
    this.ctx.emit('state/changed', mutation)
    this.scheduleFlush()
    const delta = this.deltaState.dump(mutation)
    this.ctx.emit('link/send', 'app-state.updated', {
      source,
      delta,
      timestamp: Date.now(),
    })
  }

  private async load(): Promise<void> {
    try {
      const source = await readFile(this.file, 'utf8')
      this.data = resolveState(JSON.parse(source))
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.ctx.logger('state').warn('failed to read state: %s', error instanceof Error ? error.message : String(error))
      this.data = resolveState(undefined)
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer)
      return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined
      void this.flush()
    }, this.flushDebounce)
  }

  private async flush(): Promise<void> {
    const directory = path.dirname(this.file)
    const temporary = `${this.file}.tmp`
    try {
      await mkdir(directory, { recursive: true })
      await writeFile(temporary, `${JSON.stringify(cloneState(this.data), null, 2)}\n`, 'utf8')
      await rename(temporary, this.file)
    }
    catch (error) {
      this.ctx.logger('state').warn('failed to persist state: %s', error instanceof Error ? error.message : String(error))
    }
  }
}

export default BackendStateService
