import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import "./App.css";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type Patient = {
  id: string;
  name: string;
  symptoms: string;
  riskLevel: RiskLevel;
  createdAt: string;
};

function App() {
  const defaultProdApiBaseUrl = "https://oncocare-api.onrender.com";
  const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  const apiBaseUrl = configuredApiBaseUrl || (import.meta.env.DEV ? "" : defaultProdApiBaseUrl);
  const api = axios.create({
    baseURL: apiBaseUrl,
    timeout: 10000,
  });
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [patientName, setPatientName] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("LOW");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [alerts, setAlerts] = useState<Patient[]>([]);

  const fetchDashboardData = async (authToken: string) => {
    const headers = { Authorization: `Bearer ${authToken}` };
    const [patientsRes, alertsRes] = await Promise.all([
      api.get("/api/patients", { headers }),
      api.get("/api/alerts", { headers }),
    ]);
    setPatients(patientsRes.data as Patient[]);
    setAlerts(alertsRes.data as Patient[]);
  };

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(authMode === "login" ? "Signing you in..." : "Creating account...");
    setIsSubmitting(true);

    try {
      const data = { email, password };
      const endpoint = authMode === "login" ? "/api/login" : "/api/register";
      const res = await api.post(endpoint, data);
      const authToken = res.data.token as string;
      localStorage.setItem("token", authToken);
      setToken(authToken);
      await fetchDashboardData(authToken);
      setMessage(authMode === "login" ? "Login successful." : "Registration successful.");
    } catch (error) {
      console.error(error);
      if (axios.isAxiosError(error) && !error.response) {
        setMessage("Network error. Set VITE_API_BASE_URL to your backend URL.");
      } else if (axios.isAxiosError(error) && error.response?.status === 405) {
        setMessage("API method not allowed. Set VITE_API_BASE_URL to your Render backend URL.");
      } else {
        setMessage(authMode === "login" ? "Login failed. Check your credentials." : "Registration failed.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreatePatient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setMessage("Please sign in first.");
      return;
    }

    setIsSubmitting(true);
    setMessage("Saving patient...");

    try {
      await api.post(
        "/api/patients",
        {
          name: patientName,
          symptoms,
          riskLevel,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setPatientName("");
      setSymptoms("");
      setRiskLevel("LOW");
      await fetchDashboardData(token);
      setMessage("Patient saved.");
    } catch (error) {
      console.error(error);
      setMessage("Could not save patient.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoadDashboard = async () => {
    if (!token) {
      return;
    }

    setMessage("Refreshing dashboard...");
    try {
      await fetchDashboardData(token);
      setMessage("Dashboard updated.");
    } catch (error) {
      console.error(error);
      setMessage("Could not load dashboard data.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken("");
    setPatients([]);
    setAlerts([]);
    setMessage("You have been signed out.");
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    fetchDashboardData(token).catch((error) => {
      console.error(error);
      setMessage("Could not load dashboard data.");
    });
  }, [token]);

  return (
    <main className="app-shell">
      <div className="orbits orbit-a" aria-hidden="true" />
      <div className="orbits orbit-b" aria-hidden="true" />

      {!token ? (
        <section className="auth-card" aria-label="OncoCare authentication">
          <img
            src="/oncocare_ai_logo.svg"
            alt="OncoCare AI"
            className="brand-logo"
          />

          <h1>Secure Access</h1>
          <p className="subtitle">
            {authMode === "login"
              ? "Sign in to continue to the care dashboard."
              : "Create a secure account to start monitoring patients."}
          </p>

          <form onSubmit={handleAuth} className="auth-form">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="name@hospital.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? authMode === "login"
                  ? "Signing In..."
                  : "Creating..."
                : authMode === "login"
                  ? "Sign In"
                  : "Register"}
            </button>
          </form>

          <button
            type="button"
            className="mode-switch"
            onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
          >
            {authMode === "login"
              ? "Need an account? Register"
              : "Already have an account? Sign In"}
          </button>

          {message && <p className="status-msg">{message}</p>}
        </section>
      ) : (
        <section className="dashboard-shell" aria-label="OncoCare dashboard">
          <header className="dashboard-header">
            <img
              src="/oncocare_ai_logo.svg"
              alt="OncoCare AI"
              className="brand-logo mini"
            />
            <div className="dashboard-actions">
              <button type="button" onClick={handleLoadDashboard}>Refresh</button>
              <button type="button" className="ghost" onClick={handleLogout}>Log Out</button>
            </div>
          </header>

          <div className="dashboard-grid">
            <article className="panel">
              <h2>Patient Form</h2>
              <form onSubmit={handleCreatePatient} className="auth-form">
                <label htmlFor="patient-name">Name</label>
                <input
                  id="patient-name"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Patient name"
                  required
                />

                <label htmlFor="symptoms">Symptoms</label>
                <textarea
                  id="symptoms"
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="Describe symptoms"
                  rows={4}
                  required
                />

                <label htmlFor="risk-level">Risk Level</label>
                <select
                  id="risk-level"
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>

                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Patient"}
                </button>
              </form>
            </article>

            <article className="panel">
              <h2>Patients</h2>
              <ul className="list">
                {patients.length === 0 ? (
                  <li className="empty">No patients yet.</li>
                ) : (
                  patients.map((patient) => (
                    <li key={patient.id} className="list-item">
                      <p className="item-title">{patient.name}</p>
                      <p>{patient.symptoms}</p>
                      <span className={`risk-badge ${patient.riskLevel.toLowerCase()}`}>
                        {patient.riskLevel}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </article>

            <article className="panel alerts-panel">
              <h2>Alerts</h2>
              <ul className="list">
                {alerts.length === 0 ? (
                  <li className="empty">No high-risk alerts.</li>
                ) : (
                  alerts.map((alert) => (
                    <li key={alert.id} className="list-item alert-item">
                      <p className="item-title">{alert.name}</p>
                      <p>{alert.symptoms}</p>
                      <span className={`risk-badge ${alert.riskLevel.toLowerCase()}`}>
                        {alert.riskLevel}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </article>
          </div>

          {message && <p className="status-msg">{message}</p>}
        </section>
      )}
    </main>
  );
}

export default App;
