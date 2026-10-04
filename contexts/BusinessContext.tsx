"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type BusinessContextType = {
  currentBusinessId: string;
  currentLabel: string;
  setBusinessId: (id: string) => void; // ✅ 新增：暴露切换函数
};

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // 默认值，防止服务端渲染时为空
  const [currentBusinessId, setCurrentBusinessIdState] = useState<string>("cus");
  const [currentLabel, setCurrentLabel] = useState("CuS Academy (教培)");

  // 1. 初始化时读取 Cookie
  useEffect(() => {
    // 简单的读取 Cookie 逻辑
    const match = document.cookie.match(new RegExp('(^| )businessId=([^;]+)'));
    if (match) {
      updateState(match[2]);
    }
  }, []);

  // 2. 统一更新逻辑
  const updateState = (id: string) => {
    setCurrentBusinessIdState(id);
    
    // 更新 Label
    const labels: Record<string, string> = {
      "cus": "CuS Academy (教培)",
      "sine": "SINE Driving School (驾校)",
      "tangent": "Tangent Group"
    };
    setCurrentLabel(labels[id] || id);
  };

  // 3. 暴露给外部的切换函数
  const setBusinessId = (id: string) => {
    updateState(id);
    // 写入 Cookie，过期时间设置长一点 (365天)
    document.cookie = `businessId=${id}; path=/; max-age=31536000; SameSite=Lax`;
    
    // 只刷新 Server Components，不做整页浏览器重载；客户端页面会立即响应 context。
    router.refresh();
  };

  return (
    <BusinessContext.Provider value={{ currentBusinessId, currentLabel, setBusinessId }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (context === undefined) {
    throw new Error("useBusiness must be used within a BusinessProvider");
  }
  return context;
}