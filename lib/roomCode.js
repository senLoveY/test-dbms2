import { randomInt } from "node:crypto";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Cryptographically random, so live room codes can't be predicted. */
export function generateRoomCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += CHARSET[randomInt(CHARSET.length)];
  }
  return code;
}
