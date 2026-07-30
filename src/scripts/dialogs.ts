const openers = new WeakMap<HTMLDialogElement, HTMLElement>();

const closeDialog = (dialog: HTMLDialogElement) => {
  if (dialog.open) dialog.close();
};

const restorePageState = (dialog: HTMLDialogElement) => {
  document.body.classList.remove('dialog-open');
  const opener = openers.get(dialog);
  if (opener?.isConnected) opener.focus();
};

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const openButton = target.closest<HTMLElement>('[data-dialog-open]');
  if (openButton?.dataset.dialogOpen) {
    const dialog = document.getElementById(openButton.dataset.dialogOpen);
    if (dialog instanceof HTMLDialogElement) {
      openers.set(dialog, openButton);
      dialog.showModal();
      document.body.classList.add('dialog-open');
      requestAnimationFrame(() => dialog.querySelector<HTMLElement>('[data-dialog-close]')?.focus());
    }
    return;
  }

  const closeButton = target.closest<HTMLElement>('[data-dialog-close]');
  if (closeButton) {
    const dialog = closeButton.closest<HTMLDialogElement>('dialog');
    if (dialog) closeDialog(dialog);
    return;
  }

  if (target instanceof HTMLDialogElement && event.target === target) closeDialog(target);
});

document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
  dialog.addEventListener('close', () => restorePageState(dialog));
  dialog.addEventListener('cancel', () => document.body.classList.remove('dialog-open'));
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const dialog = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).at(-1);
  if (dialog) {
    event.preventDefault();
    closeDialog(dialog);
  }
});

export {};
