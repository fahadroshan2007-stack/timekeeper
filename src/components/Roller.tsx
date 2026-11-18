export default function Roller() {
  return (
    <div className="roller-assembly" aria-hidden="true">
      <div className="carriage-knob" />
      <div className="carriage-stem" />
      <div className="platen-roller">
        <div className="paper-bail-rod">
          <div className="pinch-wheel" />
          <div className="pinch-wheel" />
          <div className="pinch-wheel" />
        </div>
      </div>
      <div className="carriage-stem" />
      <div className="carriage-knob" />
    </div>
  );
}
