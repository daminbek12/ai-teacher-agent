import React, { createContext, useContext, useState, useEffect } from "react";
import { api, getToken, setToken, clearToken } from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api("/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = async (name, password) => {
    const d = await api("/auth/login", { method: "POST", body: { name, password } });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  };

  const register = async (data) => {
    const d = await api("/auth/register", { method: "POST", body: data });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
