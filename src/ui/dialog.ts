/**
 * 確認ダイアログ。
 * ⚠️ ネイティブの confirm() は使わない（見た目がOS依存で、ゲームの世界から浮くため）。
 */
export function confirmDialog(title: string, body: string, okLabel: string): Promise<boolean> {
  const el = document.getElementById('dialog') as HTMLDivElement;
  (el.querySelector('.d-title') as HTMLElement).textContent = title;
  (el.querySelector('.d-body') as HTMLElement).textContent = body;
  const ok = el.querySelector('.d-ok') as HTMLButtonElement;
  const cancel = el.querySelector('.d-cancel') as HTMLButtonElement;
  ok.textContent = okLabel;
  el.hidden = false;

  return new Promise((resolve) => {
    const done = (v: boolean) => () => {
      el.hidden = true;
      // ⚠️ リスナーを外す。外さないと押すたびに多重登録される
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      resolve(v);
    };
    const onOk = done(true);
    const onCancel = done(false);
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
  });
}
