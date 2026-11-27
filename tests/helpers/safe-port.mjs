// 시험 서버가 Chromium이 막는 포트에 뜨면 브라우저가 접속을 거부한다(#1420).
// 금지 포트 목록은 Chromium 소스 net/base/port_util.cc 의 kRestrictedPorts 를 옮긴 것이다.
// 출처: https://chromium.googlesource.com/chromium/src/+/main/net/base/port_util.cc
const SESSION_PORT = Number(process.env.LT_SESSION_PORT || 0);

export const CHROMIUM_RESTRICTED_PORTS = new Set([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69,
  77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123,
  135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530,
  531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719,
  1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667,
  6668, 6669, 6697, 10080
]);

export const MAX_SAFE_PORT_TRIES = 24;

/**
 * 서버를 띄우고, OS가 준 포트가 금지 목록이면 닫고 다시 받는다.
 * listen(0)의 동작(주소·콜백)은 그대로 두고 포트 선택만 감싼다.
 * @param {import('node:net').Server} server
 * @param {string} [host] 없으면 호스트 인자 없이 listen(0, cb)를 부른다.
 * @param {{port?:number,maxTries?:number}} [options] port가 0이 아니면 그대로 쓴다.
 * @returns {Promise<number>} 실제로 열린 포트
 */
export function listenOnSafePort(server, host, options = {}) {
  const port = options.port ?? SESSION_PORT;
  const maxTries = options.maxTries ?? MAX_SAFE_PORT_TRIES;
  const open = callback => {
    if (host === undefined) server.listen(port, callback);
    else server.listen(port, host, callback);
  };
  const wait = () => new Promise((resolve, reject) => {
    const onError = error => { server.removeListener('error', onError); reject(error); };
    server.once('error', onError);
    open(() => {
      server.removeListener('error', onError);
      resolve(server.address().port);
    });
  });
  const close = () => new Promise(resolve => server.close(resolve));
  const loop = async tries => {
    const chosen = await wait();
    if (port !== 0 || !CHROMIUM_RESTRICTED_PORTS.has(chosen)) return chosen;
    if (tries + 1 >= maxTries) {
      await close();
      throw new Error(`시험 서버 포트를 ${maxTries}번 다시 받았지만 Chromium이 막는 포트만 나왔습니다(마지막 ${chosen})`);
    }
    await close();
    return loop(tries + 1);
  };
  return loop(0);
}
