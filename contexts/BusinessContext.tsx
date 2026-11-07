"use client";

import React, { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";

type BusinessContextType = {
  currentBusinessId: string;
  currentLabel: string;
  careOnly: boolean;
  astraOnly: boolean;
  setBusinessId: (id: string) => void; // ✅ 新增：暴露切换函数
};

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children, initialBusinessId = "cus", careOnly = false, astraOnly = false }: { children: React.ReactNode; initialBusinessId?: string; careOnly?:boolean; astraOnly?:boolean }) {
  const router = useRouter();
  // 默认值，防止服务端渲染时为空
  const [currentBusinessId, setCurrentBusinessIdState] = useState<string>(astraOnly?"astra":careOnly?"care":initialBusinessId);
  const [currentLabel, setCurrentLabel] = useState(({ astra:"Astra Education", cus: "CuS Academy (教培)", sine: "SINE Driving School (驾校)", tangent: "Tangent Group", family: "Family" } as Record<string, string>)[astraOnly?"astra":careOnly?"care":initialBusinessId] || (astraOnly?"Astra Education":careOnly?"晚托":initialBusinessId));

  // 2. 统一更新逻辑
  const updateState = (id: string) => {
    setCurrentBusinessIdState(id);
    
    // 更新 Label
    const labels: Record<string, string> = {
      "astra": "Astra Education",
      "cus": "CuS Academy (教培)",
      "sine": "SINE Driving School (驾校)",
      "tangent": "Tangent Group",
      "family": "Family"
    };
    setCurrentLabel(labels[id] || id);
  };

  // 3. 暴露给外部的切换函数
  const setBusinessId = (id: string) => {
    if(careOnly||astraOnly)return;
    updateState(id);
    // 写入 Cookie，过期时间设置长一点 (365天)
    document.cookie = `businessId=${id}; path=/; max-age=31536000; SameSite=Lax`;
    
    // 只刷新 Server Components，不做整页浏览器重载；客户端页面会立即响应 context。
    router.refresh();
  };

  return (
    <BusinessContext.Provider value={{ currentBusinessId:astraOnly?"astra":careOnly?"care":currentBusinessId, currentLabel:astraOnly?"Astra Education":careOnly?"晚托":currentLabel, careOnly, astraOnly, setBusinessId }}>
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