import Paper from "./components/Paper";
import Chassis from "./components/Chassis";

export default function App() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-transparent">
      <Paper />
      <Chassis />
    </div>
  );
}
