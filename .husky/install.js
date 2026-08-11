// Skip Husky install in production and CI
async function install() {
  if (process.env.NODE_ENV === 'production' || process.env.CI === 'true')
    return

  const { default: husky } = await import('husky')
  console.log(husky())
}

void install()