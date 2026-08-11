import type { PropType } from 'vue'
import { defineComponent, h } from 'vue'
import { useContext } from '../context'

export const ClientSlot = defineComponent({
  name: 'ClientSlot',
  inheritAttrs: false,
  props: {
    name: { type: String, required: true },
    data: Object as PropType<Record<string, unknown>>,
    single: Boolean,
  },
  setup(props, { attrs, slots }) {
    const ctx = useContext()

    return () => {
      const entries = (ctx.client.router.views.get(props.name) ?? [])
        .filter(entry => !entry.disabled?.())
      const componentProps = { ...attrs, ...props.data }

      if (props.single) {
        const entry = entries.at(-1)
        return entry
          ? h(entry.component, componentProps, slots)
          : slots.default?.()
      }

      return [
        ...(slots.default?.() ?? []),
        ...entries.map(entry => h(entry.component, {
          ...componentProps,
          key: entry.id,
        }, slots)),
      ]
    }
  },
})

export default ClientSlot
