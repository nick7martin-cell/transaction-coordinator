/** Courier-Bold field values on the closing worksheet (matches .ws-field CSS). */
export const WS_FIELD_FONT_BASE_PT = 9;
export const WS_FIELD_FONT_MIN_PT = 5.5;
const fontAt = (sizePt: number) =>
  `700 ${sizePt}pt "Courier New", Courier, monospace`;

let measureCtx: CanvasRenderingContext2D | null = null;

function measureTextWidth(text: string, sizePt: number): number {
  if (typeof document === "undefined") return 0;
  if (!measureCtx) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");
  }
  if (!measureCtx) return 0;
  measureCtx.font = fontAt(sizePt);
  return measureCtx.measureText(text).width;
}

/** Shrink font-size so the full value fits on one line inside the input box. */
export function fitWorksheetInputFont(input: HTMLInputElement): void {
  const text = input.value;
  if (!text.trim()) {
    input.style.fontSize = `${WS_FIELD_FONT_BASE_PT}pt`;
    return;
  }

  const maxWidth = input.clientWidth - 4;
  if (maxWidth <= 0) return;

  let sizePt = WS_FIELD_FONT_BASE_PT;
  while (sizePt > WS_FIELD_FONT_MIN_PT) {
    if (measureTextWidth(text, sizePt) <= maxWidth) break;
    sizePt -= 0.25;
  }

  input.style.fontSize = `${sizePt}pt`;
}
