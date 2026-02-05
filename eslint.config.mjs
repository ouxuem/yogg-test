import antfu from '@antfu/eslint-config'

const config = await antfu({
  nextjs: true,
  react: true,
  typescript: {
    tsconfigPath: 'tsconfig.json',
  },
  ignores: [
    'bun.lock',
    '.features-gen/**',
    'src/components/ui/**',
  ],
})

for (const item of config) {
  if (item.rules) {
    for (const [rule, setting] of Object.entries(item.rules)) {
      if (setting === 'warn' || (Array.isArray(setting) && setting[0] === 'warn')) {
        if (Array.isArray(setting)) {
          setting[0] = 'error'
        }
        else {
          item.rules[rule] = 'error'
        }
      }
    }
  }
}

export default config
