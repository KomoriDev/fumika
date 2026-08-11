import type {
  AppStateGetReply,
  AppStateNamespaces,
  AppStateUpdatedEvent,
  Mutation,
} from '@fumika/state'
import type { Context } from 'cordis'
import {
  apply,
  cloneState,
  DeltaState,
  observe,
  resolveState,
  StateService,
} from '@fumika/state'
import { Service } from 'cordis'
import { reactive } from 'vue'

export class FrontendStateService extends StateService {
  static inject = ['link']

  private readonly deltaState = new DeltaState()
  private readonly source = crypto.randomUUID()

  constructor(ctx: Context) {
    super(ctx)
    this.data = reactive(this.data) as AppStateNamespaces
  }

  override mutate(mutator: (state: AppStateNamespaces) => void): Mutation | null {
    const draft = cloneState(this.data)
    const mutation = observe(draft, mutator)
    if (!mutation)
      return null
    apply(this.data, mutation)
    this.ctx.emit('state/changed', mutation)
    this.onMutate(mutation)
    return mutation
  }

  async* [Service.init]() {
    try {
      const remote = await this.ctx.link.action('app-state.get') as AppStateGetReply
      replaceState(this.data, resolveState(remote.state))
      this.deltaState.restore(remote.cursor as never)
    }
    catch (error) {
      this.ctx.logger('state').warn('failed to load state: %s', error instanceof Error ? error.message : String(error))
    }

    yield this.ctx.link.on('app-state.updated', (event: AppStateUpdatedEvent) => {
      if (event.source === this.source)
        return
      if (event.delta) {
        const mutation = this.deltaState.load(event.delta as never)
        apply(this.data, mutation)
        this.ctx.emit('state/changed', mutation)
        return
      }
      if (event.state)
        replaceState(this.data, resolveState(event.state))
    })
  }

  protected onMutate(mutation: Mutation): void {
    const delta = this.deltaState.dump(mutation)
    void this.ctx.link.action('app-state.update', { delta, source: this.source })
      .catch((error: unknown) => {
        this.ctx.logger('state').warn('failed to update state: %s', error instanceof Error ? error.message : String(error))
      })
  }
}

function replaceState(target: AppStateNamespaces, source: AppStateNamespaces): void {
  for (const key of Object.keys(target)) {
    if (!(key in source))
      delete target[key]
  }
  Object.assign(target, source)
}

export default FrontendStateService
