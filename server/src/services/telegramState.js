const state = new Map();

export function setState(chatId, key, value) {
  if (!state.has(chatId)) state.set(chatId, {});
  state.get(chatId)[key] = value;
}

export function getState(chatId, key = null) {
  const s = state.get(chatId) || {};
  return key ? s[key] : s;
}

export function clearState(chatId, key = null) {
  if (key == null) {
    state.delete(chatId);
    return;
  }
  const s = state.get(chatId);
  if (s && key in s) {
    delete s[key];
  }
}

export function hasState(chatId, key) {
  const s = state.get(chatId) || {};
  return key in s;
}

export function appendState(chatId, key, value) {
  if (!state.has(chatId)) state.set(chatId, {});
  const s = state.get(chatId);
  if (!Array.isArray(s[key])) s[key] = [];
  s[key].push(value);
}

export default state;
