/* CHANGE A0'S STATEMENTS, SPLIT ONE WAY (auto cloud save design, A8).

   The A0 file is two DO statements, sent one at a time. This is the only
   place that splits it, so the test that checks the file's shape
   (test/sql/a0.test.mjs) and anything that sends the statements one by one
   read the same two statements. */

/* The two statements of the A0 file, exactly as they appear in it. */
export function a0Statements(text) {
  const blocks = String(text).match(/do \$a0_[a-z]+\$[\s\S]*?\$a0_[a-z]+\$;/g) || [];
  if (blocks.length !== 2) throw new Error('the A0 file should hold exactly two statements, found ' + blocks.length);
  return blocks;
}
