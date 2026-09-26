import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { CoordinatorView } from "@/views/CoordinatorView";
import { DriverView } from "@/views/DriverView";
import { ClerkView } from "@/views/ClerkView";

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/coordinator" replace />} />
        <Route path="coordinator" element={<CoordinatorView />} />
        <Route path="driver" element={<DriverView />} />
        <Route path="clerk" element={<ClerkView />} />
        <Route path="*" element={<Navigate to="/coordinator" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
