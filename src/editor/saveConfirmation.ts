/** In Joplin 3.5 the save API dispatches an editor event without awaiting persistence. */
export async function confirmSavedBody(
 read: () => Promise<string>,
 expected: string,
 previous: string,
 delay: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 250)),
): Promise<void> {
 for (let attempt = 0; attempt < 21; attempt++) {
  const body = await read();
  if (body === expected) return;
  if (body !== previous) throw new Error('The note changed while Joplin was saving. Reload to review the latest version; your draft is preserved.');
  if (attempt < 20) await delay();
 }
 throw new Error('Joplin has not confirmed this save. Your draft is preserved. Reload to check the note before retrying.');
}
