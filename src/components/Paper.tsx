export default function Paper() {
  return (
    <section
      data-testid="paper"
      className="relative min-h-0 flex-[1.4] rounded-t-2xl bg-[#FDF6E3] shadow-2xl"
    >
      <div
        data-testid="paper-content"
        className="absolute inset-0 rounded-t-2xl px-4 py-3"
      />
    </section>
  );
}
