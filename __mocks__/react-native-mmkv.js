const store = {};
const MMKV = jest.fn().mockImplementation(() => ({
  set: (key, val) => { store[key] = val; },
  getString: (key) => store[key],
  getNumber: (key) => store[key],
  delete: (key) => { delete store[key]; },
  contains: (key) => key in store,
}));
module.exports = { MMKV };
