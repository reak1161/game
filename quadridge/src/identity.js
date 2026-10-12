const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9_\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]+$/u;

export function normalizeDisplayName(input) {
  if (typeof input !== 'string') throw new Error('名前を入力してください。');
  const name = input.trim().normalize('NFKC');
  const length = [...name].length;
  if (length < 1 || length > 16 || !DISPLAY_NAME_PATTERN.test(name)) {
    throw new Error('名前は1〜16文字の英数字・日本語・アンダースコアで入力してください。');
  }
  return name;
}

export function normalizeRoomCode(input) {
  if (typeof input !== 'string') throw new Error('6桁のルームIDを入力してください。');
  const code = input.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('ルームIDは6桁の英数字です。');
  return code;
}
