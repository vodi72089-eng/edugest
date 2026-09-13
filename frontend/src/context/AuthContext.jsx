import { createContext, useContext, useEffect, useState } from "react";
import api from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = anon, obj = logged in
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/auth/me");
        setUser(data.user);
      } catch {
        setUser(false);
      } finally {
        setInitialized(true);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.token) localStorage.setItem("edugest_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const registerSchool = async (payload) => {
    const { data } = await api.post("/auth/register-school", payload);
    if (data.token) localStorage.setItem("edugest_token", data.token);
    setUser(data.user);
    return data;
  };

  const parentLogin = async (school_id, username, password) => {
    const { data } = await api.post("/auth/parent-login", { school_id, username, password });
    if (data.token) localStorage.setItem("edugest_token", data.token);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("edugest_token");
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, initialized, login, registerSchool, parentLogin, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
