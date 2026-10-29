import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { CompanyPage } from "./pages/CompanyPage";
import { JobPage } from "./pages/JobPage";
import { JobsPage } from "./pages/JobsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ResumePage } from "./pages/ResumePage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<JobsPage />} />
        <Route path="jobs/:id" element={<JobPage />} />
        <Route path="companies/:id" element={<CompanyPage />} />
        <Route path="resume" element={<ResumePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
