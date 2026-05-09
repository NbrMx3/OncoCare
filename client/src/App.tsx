import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import "./App.css";

type Role = "ADMIN" | "DOCTOR" | "PATIENT";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
type AppointmentStatus = "SCHEDULED" | "COMPLETED" | "MISSED";

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
  loginId?: string | null;
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

type Appointment = {
  id: string;
  patientId: string;
  doctorId: string;
  date: string;
  status: AppointmentStatus;
  notes?: string | null;
  createdAt: string;
  patient?: Patient;
};

type MonitoringFlagsResponse = {
  highRiskAssessments?: Array<{
    id: string;
    symptoms: string;
    riskLevel: RiskLevel;
    patient?: { name?: string };
  }>;
};

const defaultProdApiBaseUrl = "https://oncocare-api-gateway.onrender.com";
const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const fallbackApiBaseUrl = configuredApiBaseUrl || defaultProdApiBaseUrl;
const apiBaseUrl = import.meta.env.DEV ? "" : fallbackApiBaseUrl;
const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10000,
});

const emptyRiskLevels: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 0,
  HIGH: 0,
};

const requestWithFallback = async <T = unknown,>(
  config: AxiosRequestConfig,
): Promise<AxiosResponse<T>> => {
  try {
    return await api.request<T>(config);
  } catch (error) {
    if (!import.meta.env.DEV || configuredApiBaseUrl) {
      throw error;
    }

    if (!axios.isAxiosError(error)) {
      throw error;
    }

    const shouldRetryOnFallback = !error.response || error.response.status === 502;
    if (!shouldRetryOnFallback) {
      throw error;
    }

    return axios.request<T>({
      ...config,
      baseURL: fallbackApiBaseUrl,
      timeout: 10000,
    });
  }
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "Date pending";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date pending";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatMonthLabel = (value: string) => {
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", { month: "short" }).format(date);
};

const getInitials = (name?: string) => {
  const parts = (name || "OC").trim().split(/\s+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "OC";
};

function MetricCard({
  label,
  value,
  detail,
  tone = "blue",
}: {
  label: string;
  value: number | string;
  detail: string;
  tone?: "blue" | "coral" | "gold" | "mint";
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className={`risk-badge ${level.toLowerCase()}`}>{level}</span>;
}

function AppointmentRow({ appointment }: { appointment: Appointment }) {
  const patientName = appointment.patient?.name ?? "Patient";

  return (
    <li className="timeline-item">
      <div>
        <p className="item-title">{patientName}</p>
        <p>{formatDateTime(appointment.date)}</p>
        {appointment.notes && <p>{appointment.notes}</p>}
      </div>
      <span className={`status-chip ${appointment.status.toLowerCase()}`}>
        {appointment.status}
      </span>
    </li>
  );
}

function PatientListItem({ patient }: { patient: Patient }) {
  return (
    <li className="patient-row">
      <div className="avatar small">{getInitials(patient.name)}</div>
      <div>
        <p className="item-title">{patient.name}</p>
        <p>{patient.age} years, {patient.gender}</p>
      </div>
      <div className="patient-contact">
        <span>{patient.phone}</span>
        <span>{patient.address}</span>
      </div>
    </li>
  );
}

function ProfileForm({
  currentUser,
  profileName,
  profileProfession,
  isDoctor,
  isSavingProfile,
  onSubmit,
  setProfileName,
  setProfileProfession,
}: {
  currentUser: UserProfile | null;
  profileName: string;
  profileProfession: string;
  isDoctor: boolean;
  isSavingProfile: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setProfileName: (value: string) => void;
  setProfileProfession: (value: string) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="form-stack">
      <label htmlFor="profile-name">Name</label>
      <input
        id="profile-name"
        value={profileName}
        onChange={(event) => setProfileName(event.target.value)}
        placeholder="Full name"
        required
      />

      <label htmlFor="profile-email">Email</label>
      <input id="profile-email" value={currentUser?.email ?? ""} readOnly disabled />

      <label htmlFor="profile-login-id">Login ID</label>
      <input
        id="profile-login-id"
        value={currentUser?.loginId ?? "Not available"}
        readOnly
        disabled
      />

      <label htmlFor="profile-role">Role</label>
      <input id="profile-role" value={currentUser?.role ?? "PATIENT"} readOnly disabled />

      {isDoctor && (
        <>
          <label htmlFor="profile-profession">Profession</label>
          <input
            id="profile-profession"
            value={profileProfession}
            onChange={(event) => setProfileProfession(event.target.value)}
            placeholder="Oncologist, surgeon, physician"
          />
        </>
      )}

      <button type="submit" disabled={isSavingProfile}>
        {isSavingProfile ? "Saving..." : "Save Profile"}
      </button>
    </form>
  );
}

function PatientRecordForm({
  patientName,
  patientAge,
  patientGender,
  patientPhone,
  patientAddress,
  isSavingPatient,
  submitLabel,
  setPatientName,
  setPatientAge,
  setPatientGender,
  setPatientPhone,
  setPatientAddress,
  onSubmit,
}: {
  patientName: string;
  patientAge: string;
  patientGender: string;
  patientPhone: string;
  patientAddress: string;
  isSavingPatient: boolean;
  submitLabel: string;
  setPatientName: (value: string) => void;
  setPatientAge: (value: string) => void;
  setPatientGender: (value: string) => void;
  setPatientPhone: (value: string) => void;
  setPatientAddress: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="form-stack">
      <label htmlFor="patient-name">Name</label>
      <input
        id="patient-name"
        value={patientName}
        onChange={(event) => setPatientName(event.target.value)}
        placeholder="Patient name"
        required
      />

      <label htmlFor="patient-age">Age</label>
      <input
        id="patient-age"
        value={patientAge}
        onChange={(event) => setPatientAge(event.target.value)}
        placeholder="Age"
        type="number"
        min="0"
        required
      />

      <label htmlFor="gender">Gender</label>
      <input
        id="gender"
        value={patientGender}
        onChange={(event) => setPatientGender(event.target.value)}
        placeholder="Gender"
        required
      />

      <label htmlFor="phone">Phone</label>
      <input
        id="phone"
        value={patientPhone}
        onChange={(event) => setPatientPhone(event.target.value)}
        placeholder="Phone"
        required
      />

      <label htmlFor="address">Address</label>
      <input
        id="address"
        value={patientAddress}
        onChange={(event) => setPatientAddress(event.target.value)}
        placeholder="Address"
        required
      />

      <button type="submit" disabled={isSavingPatient}>
        {isSavingPatient ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}

function App() {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("PATIENT");
  const [profession, setProfession] = useState("");
  const [message, setMessage] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSavingPatient, setIsSavingPatient] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAddress, setPatientAddress] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileProfession, setProfileProfession] = useState("");

  const fetchDashboardData = useCallback(async (authToken: string) => {
    const headers = { Authorization: `Bearer ${authToken}` };
    const meRes = await requestWithFallback<UserProfile>({
      method: "get",
      url: "/api/auth/me",
      headers,
    });
    const user = meRes.data as UserProfile;

    const [patientsRes, flagsRes, appointmentsRes] = await Promise.all([
      requestWithFallback<Patient[]>({ method: "get", url: "/api/patients", headers }),
      requestWithFallback<MonitoringFlagsResponse>({ method: "get", url: "/api/monitoring/flags", headers }),
      requestWithFallback<Appointment[]>({ method: "get", url: "/api/appointments", headers }),
    ]);

    setCurrentUser(user);
    setProfileName(user.name);
    setProfileProfession(user.profession ?? "");
    setPatients(patientsRes.data as Patient[]);
    setAppointments(appointmentsRes.data as Appointment[]);

    const highRisk = ((flagsRes.data as MonitoringFlagsResponse).highRiskAssessments ?? []).map((row) => ({
      id: row.id,
      name: row.patient?.name ?? "Unknown patient",
      symptoms: row.symptoms,
      riskLevel: row.riskLevel,
    }));
    setAlerts(highRisk);

    if (user.role === "DOCTOR" || user.role === "ADMIN") {
      const statsRes = await requestWithFallback<DashboardStats>({
        method: "get",
        url: "/api/dashboard/stats",
        headers,
      });
      setDashboardStats(statsRes.data as DashboardStats);
    } else {
      setDashboardStats(null);
    }
  }, []);

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(authMode === "login" ? "Signing you in..." : "Creating account...");
    setIsAuthenticating(true);

    try {
      const data = authMode === "login"
        ? { identifier, password }
        : {
            email,
            password,
            name: name.trim() || email.split("@")[0] || "Patient",
            role,
            ...(role === "DOCTOR" && profession.trim() ? { profession: profession.trim() } : {}),
          };
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await requestWithFallback<{ token: string; user?: UserProfile }>({
        method: "post",
        url: endpoint,
        data,
      });
      const authToken = res.data.token as string;
      const newUser = res.data.user as UserProfile | undefined;
      const successMessage =
        authMode === "login"
          ? "Login successful."
          : newUser?.loginId
            ? `Registration successful. Your login ID is ${newUser.loginId}`
            : "Registration successful.";
      localStorage.setItem("token", authToken);
      setToken(authToken);
      setMessage(successMessage);

      try {
        await fetchDashboardData(authToken);
        setMessage(successMessage);
      } catch (refreshError) {
        console.error(refreshError);
        setMessage(`${successMessage} Dashboard data could not be loaded right now.`);
      }
    } catch (error) {
      console.error(error);
      if (axios.isAxiosError(error) && !error.response) {
        setMessage("Network error. Set VITE_API_BASE_URL to your backend URL.");
      } else if (axios.isAxiosError(error) && error.response?.status === 409) {
        const apiMessage = (error.response.data as { message?: string } | undefined)?.message;
        setMessage(apiMessage || "This email is already registered. Please sign in instead.");
      } else if (axios.isAxiosError(error) && error.response?.status === 502) {
        setMessage("Backend unavailable (502). Start backend with: cd server && node server.js");
      } else if (axios.isAxiosError(error) && error.response?.status === 405) {
        setMessage("API method not allowed. Set VITE_API_BASE_URL to your Render backend URL.");
      } else {
        setMessage(authMode === "login" ? "Login failed. Check your credentials." : "Registration failed.");
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleCreatePatient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setMessage("Please sign in first.");
      return;
    }

    setIsSavingPatient(true);
    setMessage("Saving patient...");

    try {
      await requestWithFallback({
        method: "post",
        url: "/api/patients",
        data: {
          name: patientName,
          age: Number(patientAge),
          gender: patientGender,
          phone: patientPhone,
          address: patientAddress,
        },
        headers: { Authorization: `Bearer ${token}` },
      });

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
      setIsSavingPatient(false);
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

      const response = await requestWithFallback<UserProfile>({
        method: "put",
        url: "/api/auth/me",
        data: payload,
        headers,
      });
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
    setAppointments([]);
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
  }, [fetchDashboardData, token]);

  const isDoctor = currentUser?.role === "DOCTOR";
  const isAdmin = currentUser?.role === "ADMIN";
  const isDoctorWorkspace = isDoctor || isAdmin;
  const loginRoleLabel = role === "DOCTOR" ? "Doctor" : "Patient";
  const loginIdentifierLabel = `${loginRoleLabel} Login ID or Email`;
  const loginIdentifierPlaceholder = role === "DOCTOR"
    ? "eg: DANIXX1001 or dr@hospital.org"
    : "eg: PJOHAX1001 or name@hospital.org";
  const patientTotal = dashboardStats?.patientCount ?? dashboardStats?.totalPatients ?? patients.length;
  const doctorTitle = isAdmin ? "Administrator Dashboard" : "Doctor Dashboard";
  const dashboardTheme = token ? (isDoctorWorkspace ? "doctor-theme" : "patient-theme") : "auth-theme";
  const riskLevels = dashboardStats?.riskLevels ?? emptyRiskLevels;
  const riskTotal = riskLevels.LOW + riskLevels.MEDIUM + riskLevels.HIGH;
  const highRiskShare = riskTotal > 0 ? Math.round((riskLevels.HIGH / riskTotal) * 100) : 0;

  const upcomingAppointments = useMemo(
    () => appointments
      .filter((appointment) => appointment.status === "SCHEDULED")
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5),
    [appointments],
  );
  const missedAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.status === "MISSED"),
    [appointments],
  );
  const completedAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.status === "COMPLETED"),
    [appointments],
  );
  const recentPatients = useMemo(() => patients.slice(0, 6), [patients]);
  const trendEntries = useMemo(
    () => Object.entries(dashboardStats?.trends ?? {})
      .sort(([first], [second]) => first.localeCompare(second))
      .slice(-6),
    [dashboardStats?.trends],
  );
  const trendMax = Math.max(1, ...trendEntries.map(([, count]) => count));
  const primaryPatient = patients[0];
  const careStatus = alerts.length > 0
    ? "Follow-up needed"
    : upcomingAppointments.length > 0
      ? "Visit scheduled"
      : "Records current";

  return (
    <main className={`app-shell ${dashboardTheme}`}>
      {!token ? (
        <section className="auth-card" aria-label="OncoCare authentication">
          <img src="/oncocare_ai_logo.svg" alt="OncoCare AI" className="brand-logo" />

          <h1>Secure Access</h1>
          <p className="subtitle">
            {authMode === "login"
              ? "Sign in to continue to your OncoCare workspace."
              : "Create a secure account for your care workspace."}
          </p>

          <form onSubmit={handleAuth} className="form-stack">
            {authMode === "login" && (
              <>
                <label>Login as</label>
                <div className="role-toggle" role="group" aria-label="Login role">
                  <button
                    type="button"
                    className={role === "PATIENT" ? "role-pill-button active" : "role-pill-button"}
                    onClick={() => setRole("PATIENT")}
                  >
                    Patient
                  </button>
                  <button
                    type="button"
                    className={role === "DOCTOR" ? "role-pill-button active" : "role-pill-button"}
                    onClick={() => setRole("DOCTOR")}
                  >
                    Doctor
                  </button>
                </div>
                <p className="helper-text">
                  Use your role-specific login ID or email to continue.
                </p>
              </>
            )}

            {authMode === "register" && (
              <>
                <label htmlFor="name">Full Name</label>
                <input
                  id="name"
                  type="text"
                  placeholder="Dr. Amina Khan"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />

                <label htmlFor="role">Account Type</label>
                <select
                  id="role"
                  value={role}
                  onChange={(event) => setRole(event.target.value as Role)}
                >
                  <option value="PATIENT">Patient</option>
                  <option value="DOCTOR">Doctor</option>
                </select>

                <p className="helper-text">
                  Login IDs are generated by role (Patient IDs start with P, Doctor IDs start with D).
                </p>

                {role === "DOCTOR" && (
                  <>
                    <label htmlFor="profession">Profession</label>
                    <input
                      id="profession"
                      type="text"
                      placeholder="Oncologist, surgeon, physician"
                      value={profession}
                      onChange={(event) => setProfession(event.target.value)}
                      required
                    />
                  </>
                )}
              </>
            )}

            {authMode === "login" ? (
              <>
                <label htmlFor="identifier">{loginIdentifierLabel}</label>
                <input
                  id="identifier"
                  type="text"
                  placeholder={loginIdentifierPlaceholder}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                />
              </>
            ) : (
              <>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="name@hospital.org"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </>
            )}

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <button type="submit" disabled={isAuthenticating}>
              {isAuthenticating
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
        <section className="workspace-shell" aria-label="OncoCare dashboard">
          <header className="workspace-topbar">
            <div className="brand-lockup">
              <img src="/oncocare_ai_logo.svg" alt="OncoCare AI" className="brand-logo mini" />
              <span>{currentUser?.role ?? "Workspace"}</span>
            </div>
            <div className="dashboard-actions">
              <button type="button" onClick={handleLoadDashboard}>Refresh</button>
              <button type="button" className="ghost" onClick={handleLogout}>Log Out</button>
            </div>
          </header>

          {isDoctorWorkspace ? (
            <div className="doctor-layout">
              <aside className="doctor-sidebar" aria-label="Clinical summary">
                <div className="avatar">{getInitials(currentUser?.name)}</div>
                <div>
                  <p className="eyebrow">Clinical lead</p>
                  <h2>{currentUser?.name || "Doctor"}</h2>
                  <p>{isDoctor ? currentUser?.profession || "Care team" : "Administrator"}</p>
                </div>
                <div className="sidebar-stat">
                  <span>High-risk share</span>
                  <strong>{highRiskShare}%</strong>
                </div>
                <div className="sidebar-stat">
                  <span>Open alerts</span>
                  <strong>{alerts.length}</strong>
                </div>
              </aside>

              <div className="doctor-main">
                <section className="workspace-hero doctor-hero">
                  <div>
                    <p className="eyebrow">Clinical operations</p>
                    <h1>{doctorTitle}</h1>
                    <p className="subtitle">
                      {patientTotal} patients, {upcomingAppointments.length} scheduled visits, {missedAppointments.length} missed follow-ups.
                    </p>
                  </div>
                  <div className="hero-signal">
                    <span>Priority queue</span>
                    <strong>{alerts.length + missedAppointments.length}</strong>
                    <small>items need review</small>
                  </div>
                </section>

                <section className="metric-grid" aria-label="Doctor statistics">
                  <MetricCard label="Patients" value={patientTotal} detail="Active records" tone="blue" />
                  <MetricCard label="Assessments" value={dashboardStats?.totalAssessments ?? 0} detail="Risk reviews" tone="mint" />
                  <MetricCard label="Appointments" value={dashboardStats?.totalAppointments ?? appointments.length} detail="Visits tracked" tone="gold" />
                  <MetricCard label="Missed" value={dashboardStats?.missedAppointments ?? missedAppointments.length} detail="Follow-ups due" tone="coral" />
                </section>

                <section className="doctor-board">
                  <article className="panel triage-panel">
                    <div className="panel-heading">
                      <h2>Risk Triage</h2>
                      <span>{alerts.length} high</span>
                    </div>
                    <ul className="list">
                      {alerts.length === 0 ? (
                        <li className="empty">No high-risk alerts.</li>
                      ) : (
                        alerts.map((alert) => (
                          <li key={alert.id} className="alert-row">
                            <div>
                              <p className="item-title">{alert.name}</p>
                              <p>{alert.symptoms}</p>
                            </div>
                            <RiskBadge level={alert.riskLevel} />
                          </li>
                        ))
                      )}
                    </ul>
                  </article>

                  <article className="panel schedule-panel">
                    <div className="panel-heading">
                      <h2>Schedule</h2>
                      <span>{upcomingAppointments.length} upcoming</span>
                    </div>
                    <ul className="list">
                      {upcomingAppointments.length === 0 ? (
                        <li className="empty">No scheduled appointments.</li>
                      ) : (
                        upcomingAppointments.map((appointment) => (
                          <AppointmentRow key={appointment.id} appointment={appointment} />
                        ))
                      )}
                    </ul>
                  </article>

                  <article className="panel roster-panel">
                    <div className="panel-heading">
                      <h2>Patient Roster</h2>
                      <span>{patients.length} records</span>
                    </div>
                    <ul className="list roster-list">
                      {recentPatients.length === 0 ? (
                        <li className="empty">No patients yet.</li>
                      ) : (
                        recentPatients.map((patient) => (
                          <PatientListItem key={patient.id} patient={patient} />
                        ))
                      )}
                    </ul>
                  </article>

                  <article className="panel risk-panel">
                    <div className="panel-heading">
                      <h2>Risk Mix</h2>
                      <span>{riskTotal} assessments</span>
                    </div>
                    <div className="risk-bars">
                      {(["LOW", "MEDIUM", "HIGH"] as RiskLevel[]).map((level) => (
                        <div className="risk-bar-row" key={level}>
                          <span>{level}</span>
                          <div className="risk-track">
                            <div
                              className={`risk-fill ${level.toLowerCase()}`}
                              style={{ width: `${riskTotal ? (riskLevels[level] / riskTotal) * 100 : 0}%` }}
                            />
                          </div>
                          <strong>{riskLevels[level]}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="trend-strip" aria-label="Assessment trend">
                      {trendEntries.length === 0 ? (
                        <span className="empty">No trend data.</span>
                      ) : (
                        trendEntries.map(([month, count]) => (
                          <div className="trend-bar" key={month}>
                            <span style={{ height: `${Math.max(12, (count / trendMax) * 100)}%` }} />
                            <small>{formatMonthLabel(month)}</small>
                          </div>
                        ))
                      )}
                    </div>
                  </article>

                  <article className="panel form-panel">
                    <div className="panel-heading">
                      <h2>Add Patient</h2>
                    </div>
                    <PatientRecordForm
                      patientName={patientName}
                      patientAge={patientAge}
                      patientGender={patientGender}
                      patientPhone={patientPhone}
                      patientAddress={patientAddress}
                      isSavingPatient={isSavingPatient}
                      submitLabel="Save Patient"
                      setPatientName={setPatientName}
                      setPatientAge={setPatientAge}
                      setPatientGender={setPatientGender}
                      setPatientPhone={setPatientPhone}
                      setPatientAddress={setPatientAddress}
                      onSubmit={handleCreatePatient}
                    />
                  </article>

                  <article className="panel profile-panel">
                    <div className="panel-heading">
                      <h2>Profile</h2>
                    </div>
                    <ProfileForm
                      currentUser={currentUser}
                      profileName={profileName}
                      profileProfession={profileProfession}
                      isDoctor={isDoctor}
                      isSavingProfile={isSavingProfile}
                      onSubmit={handleUpdateProfile}
                      setProfileName={setProfileName}
                      setProfileProfession={setProfileProfession}
                    />
                  </article>
                </section>
              </div>
            </div>
          ) : (
            <div className="patient-layout">
              <section className="workspace-hero patient-hero">
                <div>
                  <p className="eyebrow">Personal care</p>
                  <h1>Patient Dashboard</h1>
                  <p className="subtitle">
                    {currentUser?.name || "Patient"} has {patients.length} care record{patients.length === 1 ? "" : "s"} and {alerts.length} open alert{alerts.length === 1 ? "" : "s"}.
                  </p>
                </div>
                <div className="care-status">
                  <span>Care status</span>
                  <strong>{careStatus}</strong>
                  <small>{upcomingAppointments[0] ? formatDateTime(upcomingAppointments[0].date) : "No scheduled visit"}</small>
                </div>
              </section>

              <section className="patient-metrics" aria-label="Patient statistics">
                <MetricCard label="Records" value={patients.length} detail="Care profiles" tone="mint" />
                <MetricCard label="Appointments" value={appointments.length} detail="Total visits" tone="blue" />
                <MetricCard label="Completed" value={completedAppointments.length} detail="Finished visits" tone="gold" />
                <MetricCard label="Alerts" value={alerts.length} detail="Need attention" tone="coral" />
              </section>

              <section className="patient-board">
                <article className="panel patient-record-panel">
                  <div className="panel-heading">
                    <h2>Care Record</h2>
                    <span>{primaryPatient ? primaryPatient.gender : "Pending"}</span>
                  </div>
                  {primaryPatient ? (
                    <div className="record-summary">
                      <div className="avatar">{getInitials(primaryPatient.name)}</div>
                      <div>
                        <p className="item-title">{primaryPatient.name}</p>
                        <p>{primaryPatient.age} years</p>
                        <p>{primaryPatient.phone}</p>
                        <p>{primaryPatient.address}</p>
                      </div>
                    </div>
                  ) : (
                    <PatientRecordForm
                      patientName={patientName}
                      patientAge={patientAge}
                      patientGender={patientGender}
                      patientPhone={patientPhone}
                      patientAddress={patientAddress}
                      isSavingPatient={isSavingPatient}
                      submitLabel="Create Record"
                      setPatientName={setPatientName}
                      setPatientAge={setPatientAge}
                      setPatientGender={setPatientGender}
                      setPatientPhone={setPatientPhone}
                      setPatientAddress={setPatientAddress}
                      onSubmit={handleCreatePatient}
                    />
                  )}
                </article>

                <article className="panel patient-alert-panel">
                  <div className="panel-heading">
                    <h2>Alerts</h2>
                    <span>{alerts.length} open</span>
                  </div>
                  <ul className="list">
                    {alerts.length === 0 ? (
                      <li className="empty">No high-risk alerts right now.</li>
                    ) : (
                      alerts.map((alert) => (
                        <li key={alert.id} className="alert-row">
                          <div>
                            <p className="item-title">{alert.name}</p>
                            <p>{alert.symptoms}</p>
                          </div>
                          <RiskBadge level={alert.riskLevel} />
                        </li>
                      ))
                    )}
                  </ul>
                </article>

                <article className="panel patient-schedule-panel">
                  <div className="panel-heading">
                    <h2>Appointments</h2>
                    <span>{appointments.length} total</span>
                  </div>
                  <ul className="list">
                    {appointments.length === 0 ? (
                      <li className="empty">No appointments recorded.</li>
                    ) : (
                      appointments.map((appointment) => (
                        <AppointmentRow key={appointment.id} appointment={appointment} />
                      ))
                    )}
                  </ul>
                </article>

                <article className="panel patient-profile-panel">
                  <div className="panel-heading">
                    <h2>Profile</h2>
                  </div>
                  <ProfileForm
                    currentUser={currentUser}
                    profileName={profileName}
                    profileProfession={profileProfession}
                    isDoctor={false}
                    isSavingProfile={isSavingProfile}
                    onSubmit={handleUpdateProfile}
                    setProfileName={setProfileName}
                    setProfileProfession={setProfileProfession}
                  />
                </article>
              </section>
            </div>
          )}

          {message && <p className="status-msg dashboard-status">{message}</p>}
        </section>
      )}
    </main>
  );
}

export default App;
