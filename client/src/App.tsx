import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import "./App.css";

type Role = "ADMIN" | "DOCTOR" | "PATIENT";

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

type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  provider?: string | null;
  profession?: string | null;
};

type DashboardStats = {
  totalPatients: number;
  patientCount?: number;
  totalAssessments: number;
  totalAppointments: number;
  missedAppointments: number;
  totalNotifications: number;
  riskLevels: Record<RiskLevel, number>;
  trends: Record<string, number>;
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
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("PATIENT");
  const [profession, setProfession] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileProfession, setProfileProfession] = useState("");

  const fetchDashboardData = async (authToken: string) => {
    const headers = { Authorization: `Bearer ${authToken}` };
    const meRes = await api.get("/api/auth/me", { headers });
    const user = meRes.data as UserProfile;

    const [patientsRes, flagsRes] = await Promise.all([
      api.get("/api/patients", { headers }),
      api.get("/api/monitoring/flags", { headers }),
    ]);

    setCurrentUser(user);
    setProfileName(user.name);
    setProfileProfession(user.profession ?? "");
    setPatients(patientsRes.data as Patient[]);

    const highRisk = ((flagsRes.data as {
      highRiskAssessments?: Array<{
        id: string;
        symptoms: string;
        riskLevel: RiskLevel;
        patient?: { name?: string };
      }>;
    }).highRiskAssessments ?? []).map((row) => ({
      id: row.id,
      name: row.patient?.name ?? "Unknown patient",
      symptoms: row.symptoms,
      riskLevel: row.riskLevel,
    }));
    setAlerts(highRisk);

    if (user.role === "DOCTOR" || user.role === "ADMIN") {
      const statsRes = await api.get("/api/dashboard/stats", { headers });
      setDashboardStats(statsRes.data as DashboardStats);
    } else {
      setDashboardStats(null);
    }
  };

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(authMode === "login" ? "Signing you in..." : "Creating account...");
    setIsSubmitting(true);

    try {
      const data = authMode === "login"
        ? { email, password }
        : {
            email,
            password,
            name: name.trim() || email.split("@")[0] || "Patient",
            role,
            ...(role === "DOCTOR" && profession.trim() ? { profession: profession.trim() } : {}),
          };
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

  const handleUpdateProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setMessage("Please sign in first.");
      return;
    }

    setIsSavingProfile(true);
    setMessage("Saving profile...");

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const payload = {
        name: profileName.trim(),
        ...(currentUser?.role === "DOCTOR" ? { profession: profileProfession.trim() || null } : {}),
      };

      const response = await api.put("/api/auth/me", payload, { headers });
      const updatedUser = response.data as UserProfile;
      setCurrentUser(updatedUser);
      setProfileName(updatedUser.name);
      setProfileProfession(updatedUser.profession ?? "");
      setMessage("Profile updated.");
    } catch (error) {
      console.error(error);
      if (axios.isAxiosError(error)) {
        setMessage((error.response?.data as { message?: string } | undefined)?.message || "Could not update profile.");
      } else {
        setMessage("Could not update profile.");
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken("");
    setPatients([]);
    setAlerts([]);
    setDashboardStats(null);
    setCurrentUser(null);
    setProfileName("");
    setProfileProfession("");
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

  const patientTotal = dashboardStats?.patientCount ?? dashboardStats?.totalPatients ?? patients.length;
  const isDoctor = currentUser?.role === "DOCTOR";
  const canEditProfile = currentUser?.role === "DOCTOR" || currentUser?.role === "ADMIN";
  const dashboardTitle = currentUser?.role === "ADMIN"
    ? "Administrator Dashboard"
    : isDoctor
      ? "Doctor Dashboard"
      : "Care Dashboard";

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
            {authMode === "register" && (
              <>
                <label htmlFor="name">Full Name</label>
                <input
                  id="name"
                  type="text"
                  placeholder="Dr. Amina Khan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />

                <label htmlFor="role">Account Type</label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="PATIENT">Patient</option>
                  <option value="DOCTOR">Doctor</option>
                </select>

                {role === "DOCTOR" && (
                  <>
                    <label htmlFor="profession">Profession</label>
                    <input
                      id="profession"
                      type="text"
                      placeholder="Oncologist, Surgeon, Physician"
                      value={profession}
                      onChange={(e) => setProfession(e.target.value)}
                      required
                    />
                  </>
                )}
              </>
            )}

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

          <section className="dashboard-hero">
            <div>
              <p className="eyebrow">
                {isDoctor ? "Doctor workspace" : currentUser?.role === "ADMIN" ? "Admin workspace" : "Care workspace"}
              </p>
              <h1>{dashboardTitle}</h1>
              <p className="subtitle">
                {isDoctor
                  ? "Track your caseload, update your profile, and review active patients in one place."
                  : currentUser?.role === "ADMIN"
                    ? "Manage the full care environment with live patient and assessment data."
                    : "Review your patient records and care alerts from a secure workspace."}
              </p>
            </div>

            <div className="hero-card">
              <span className="hero-label">Profile snapshot</span>
              <strong>{currentUser?.name || "Unknown user"}</strong>
              <p>{currentUser?.email}</p>
              <span className="role-pill">{currentUser?.role || "PATIENT"}</span>
            </div>
          </section>

          {dashboardStats && (
            <section className="stat-grid" aria-label="Doctor statistics">
              <article className="stat-card accent">
                <span>Patients</span>
                <strong>{patientTotal}</strong>
                <small>Number of patients under care</small>
              </article>
              <article className="stat-card">
                <span>Appointments</span>
                <strong>{dashboardStats.totalAppointments}</strong>
                <small>Total scheduled and completed visits</small>
              </article>
              <article className="stat-card">
                <span>Missed</span>
                <strong>{dashboardStats.missedAppointments}</strong>
                <small>Appointments that need follow-up</small>
              </article>
              <article className="stat-card">
                <span>Assessments</span>
                <strong>{dashboardStats.totalAssessments}</strong>
                <small>Clinical reviews in the system</small>
              </article>
            </section>
          )}

          <div className="dashboard-grid">
            {canEditProfile && (
              <article className="panel profile-panel">
                <h2>Doctor Profile</h2>
                <form onSubmit={handleUpdateProfile} className="auth-form">
                  <label htmlFor="profile-name">Name</label>
                  <input
                    id="profile-name"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Full name"
                    required
                  />

                  <label htmlFor="profile-email">Email</label>
                  <input
                    id="profile-email"
                    value={currentUser?.email ?? ""}
                    readOnly
                    disabled
                  />

                  <label htmlFor="profile-role">Role</label>
                  <input
                    id="profile-role"
                    value={currentUser?.role ?? "PATIENT"}
                    readOnly
                    disabled
                  />

                  <label htmlFor="profile-profession">Profession</label>
                  <input
                    id="profile-profession"
                    value={profileProfession}
                    onChange={(e) => setProfileProfession(e.target.value)}
                    placeholder="Doctor profession"
                    disabled={!isDoctor}
                  />

                  <button type="submit" disabled={isSavingProfile}>
                    {isSavingProfile ? "Saving..." : "Save Profile"}
                  </button>
                </form>
              </article>
            )}

            {currentUser?.role !== "PATIENT" && (
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
            )}

            <article className="panel wide-panel">
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
