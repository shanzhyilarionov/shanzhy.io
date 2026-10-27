export function measureRevealLines(block) {
  const source = block.firstElementChild;
  const node = source?.firstChild;
  const text = node?.textContent;
  if (!text) return [];

  const bounds = block.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(block).lineHeight);
  const range = document.createRange();
  range.selectNodeContents(source);
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  const offsets = [0];
  for (const character of text) offsets.push(offsets.at(-1) + character.length);
  const count = offsets.length - 1;
  let start = 0;

  return rects.flatMap((rect, index) => {
    let end = count;
    if (index < rects.length - 1) {
      let low = start + 1;
      let high = count;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        range.setStart(node, offsets[middle]);
        range.setEnd(node, offsets[middle + 1]);
        if (range.getBoundingClientRect().top <= rect.top + 0.5) low = middle + 1;
        else high = middle;
      }
      end = low;
    }

    const fragment = text.slice(offsets[start], offsets[end]);
    const leading = fragment.length - fragment.trimStart().length;
    const trailing = fragment.length - fragment.trimEnd().length;
    const startOffset = offsets[start] + leading;
    const endOffset = offsets[end] - trailing;
    start = end;
    if (startOffset >= endOffset) return [];

    range.setStart(node, startOffset);
    range.setEnd(node, endOffset);
    const lineBounds = range.getBoundingClientRect();
    return [{
      text: text.slice(startOffset, endOffset),
      left: lineBounds.left - bounds.left,
      top: lineBounds.top - bounds.top - (lineHeight - lineBounds.height) / 2,
    }];
  });
}
