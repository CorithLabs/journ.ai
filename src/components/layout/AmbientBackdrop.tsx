/**
 * The animated blue light behind the whole app.
 *
 * Purely decorative and entirely inert: fixed, behind every surface, and
 * pointer-events: none, so it cannot intercept input. Marked aria-hidden
 * because there is nothing here for a screen reader to convey.
 *
 * All of the styling and motion lives in index.css under `.ambient` — kept
 * there rather than in Tailwind classes because the keyframes, the radial
 * gradients and the reduced-motion resting positions belong together, and
 * arbitrary-value utilities would scatter them across three files.
 */
export default function AmbientBackdrop() {
  return (
    <div className="ambient" aria-hidden="true" data-testid="ambient-backdrop">
      <span className="ambient__form ambient__form--1" />
      <span className="ambient__form ambient__form--2" />
      <span className="ambient__form ambient__form--3" />
    </div>
  );
}
