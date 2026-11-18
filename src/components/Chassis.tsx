export default function Chassis() {
  return (
    <section
      data-testid="chassis"
      className="relative min-h-0 flex-1 rounded-t-2xl bg-slate-900 p-3 shadow-2xl"
    >
      <div
        data-testid="lcd-display"
        className="mb-3 flex items-center justify-end rounded-lg bg-black px-3 py-2 font-mono text-xl text-[#4ADE80]"
      >
        {"--:--"}
      </div>
      <div data-testid="chassis-keys" className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            data-testid={`chassis-key-${i}`}
            className="h-9 rounded-md bg-[#D6C7A1] shadow-md"
          />
        ))}
      </div>
    </section>
  );
}
