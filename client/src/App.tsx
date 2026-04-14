import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import "./App.css";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

type Patient = {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  address: string;
  createdAt: string;
};

type RiskAlert = {
  id: string;
  name: string;
  symptoms: string;
  riskLevel: RiskLevel;
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
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);

  const fetchDashboardData = async (authToken: string) => {
    const headers = { Authorization: `Bearer ${authToken}` };
    const [patientsRes, flagsRes] = await Promise.all([
      api.get("/api/patients", { headers }),
      api.get("/api/monitoring/flags", { headers }),
    ]);
    setPatients(patientsRes.data as Patient[]);

    const highRisk = ((flagsRes.data as { highRiskAssessments?: Array<{ id: string; symptoms: string; riskLevel: RiskLevel; patient?: { name?: string } }> }).highRiskAssessments ?? [])
      .map((row) => ({
        id: row.id,
        name: row.patient?.name ?? "Unknown patient",
        symptoms: row.symptoms,
        riskLevel: row.riskLevel,
      }));
    setAlerts(highRisk);
  };

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(authMode === "login" ? "Signing you in..." : "Creating account...");
    setIsSubmitting(true);

    try {
      const data = authMode === "login"
        ? { email, password }
        : { email, password, name: email.split("@")[0] || "Patient" };
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
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
          age: Number(patientAge),
          gender: patientGender,
          phone: patientPhone,
          address: patientAddress,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      setPatientName("");
      setPatientAge("");
      setPatientGender("");
      setPatientPhone("");
      setPatientAddress("");

      try {
        await fetchDashboardData(token);
        setMessage("Patient saved.");
      } catch (refreshError) {
        console.error(refreshError);
        setMessage("Patient saved, but dashboard refresh failed. Try Refresh.");
      }
    } catch (error) {
      console.error(error);

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;

        if (!error.response) {
          setMessage("Network error. Set VITE_API_BASE_URL to your backend URL.");
        } else if (status === 400) {
          setMessage(apiMessage || "Invalid patient details.");
        } else if (status === 401) {
          setMessage("Session expired. Please sign in again.");
        } else if (status === 403) {
          setMessage("Forbidden: your account cannot save patients.");
        } else if (status === 502) {
          setMessage("Backend unavailable (502). Try again in a moment.");
        } else {
          setMessage(apiMessage || `Could not save patient (HTTP ${status}).`);
        }
      } else {
        setMessage("Could not save patient.");
      }
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

                <label htmlFor="patient-age">Age</label>
                <input
                  id="patient-age"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                  placeholder="Age"
                  type="number"
                  required
                />

                <label htmlFor="gender">Gender</label>
                <input
                  id="gender"
                  value={patientGender}
                  onChange={(e) => setPatientGender(e.target.value)}
                  placeholder="Gender"
                  required
                />

                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  placeholder="Phone"
                  required
                />

                <label htmlFor="address">Address</label>
                <input
                  id="address"
                  value={patientAddress}
                  onChange={(e) => setPatientAddress(e.target.value)}
                  placeholder="Address"
                  required
                />

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
                      <p>{patient.age} years, {patient.gender}</p>
                      <p>{patient.phone}</p>
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
