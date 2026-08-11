import antfu from '@antfu/eslint-config'
import betterTailwindcss from 'eslint-plugin-better-tailwindcss'

export default antfu(
  {
    ignores: ['.husky/**'],
    typescript: {
      overrides: {
        'ts/no-namespace': 'off',
        'ts/consistent-type-imports': 'off',
      },
    },
  },
  {
    name: 'fumika/tailwindcss',
    files: ['packages/webui/**/*.{js,jsx,cjs,mjs,ts,tsx,vue}'],
    plugins: {
      'better-tailwindcss': betterTailwindcss,
    },
    settings: {
      'better-tailwindcss': {
        cwd: './packages/webui',
        entryPoint: './src/style.css',
        rootFontSize: 16,
      },
    },
    rules: {
      'better-tailwindcss/enforce-canonical-classes': 'warn',
    },
  },
)
