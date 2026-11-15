import * as OBF from '@thatopen/components-front';

/**
 * Measurement tags: That Open draws big boxes in the measurement color with "m²"; we show a
 * small dark tag with "m2" and solid endpoint dots. Tags/dots get a class that index.css styles with !important,
 * which beats the inline colors That Open re-applies on every color change. Lines drawn with a material flagged
 * `userData.hideEndpoints` get no dots at all (area outlines).
 */
/** Runs after any value tag changes. Volumes compute asynchronously after they're added, so Σ tags listen here. */
export const measureValues = { onChange: () => {} };

export function patchMeasureLabels() {
  const line = OBF.DimensionLine.prototype as unknown as {
    newText(): OBF.Mark;
    createEndpoints(): void;
    _endpoints: Iterable<OBF.Mark>;
    _material: { userData: { hideEndpoints?: boolean } };
  };
  const newText = line.newText;
  line.newText = function (this: typeof line) {
    const mark = newText.call(this);
    mark.three.element.classList.add('measure-label');
    return mark;
  };
  const createEndpoints = line.createEndpoints;
  line.createEndpoints = function (this: typeof line) {
    createEndpoints.call(this);
    const cls = this._material.userData.hideEndpoints ? 'measure-dot-hidden' : 'measure-dot';
    for (const p of this._endpoints) p.three.element.classList.add(cls);
  };

  const mark = OBF.MeasureMark.prototype;
  const value = Object.getOwnPropertyDescriptor(mark, 'value')!;
  Object.defineProperty(mark, 'value', {
    ...value,
    set(this: OBF.MeasureMark, v: number) {
      value.set!.call(this, v);
      queueMicrotask(measureValues.onChange); // after the caller has also moved the tag
    },
  });
  const formatted = Object.getOwnPropertyDescriptor(mark, 'formattedValue')!.get!;
  Object.defineProperty(mark, 'formattedValue', {
    get(this: OBF.MeasureMark) {
      this.three.element.classList.add('measure-label'); // every text update goes through here, incl. the constructor
      return (formatted.call(this) as string).replace('²', '2').replace('³', '3');
    },
  });
}
