/** An `onOpenChange` handler that runs `close` only when a sheet or dialog asks to close. */
export function onClosed(close: () => void): (open: boolean) => void {
  return (open: boolean): void => {
    if (!open) close();
  };
}
