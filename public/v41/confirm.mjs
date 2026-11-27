export function askAppConfirm(message) {
  const ask = globalThis.LT41Confirm?.ask;
  return typeof ask === 'function' ? ask(message) : Promise.resolve(false);
}
