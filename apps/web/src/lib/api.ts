const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const EXPORT_TOKEN = process.env.NEXT_PUBLIC_EXPORT_TOKEN;

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}

async function request(endpoint: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add export token if available and endpoint is export
  if (EXPORT_TOKEN && endpoint.startsWith('/export')) {
    headers['Authorization'] = `Bearer ${EXPORT_TOKEN}`;
  }

  const config: RequestInit = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body) {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  // Handle different content types
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return { data: await response.json() };
  } else if (contentType?.includes('text/csv')) {
    return { data: await response.text(), isCSV: true };
  } else if (contentType?.includes('text/html')) {
    return { data: await response.text(), isHTML: true };
  }

  return { data: await response.text() };
}

export const api = {
  get: (endpoint: string) => request(endpoint, { method: 'GET' }),
  post: (endpoint: string, body?: any) => request(endpoint, { method: 'POST', body }),
  put: (endpoint: string, body?: any) => request(endpoint, { method: 'PUT', body }),
  delete: (endpoint: string) => request(endpoint, { method: 'DELETE' }),
};

// Export utilities
export async function exportAlerts(params: { minIrs?: number; from?: string; to?: string }) {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  
  const response = await request(`/export/alerts.csv${queryString ? `?${queryString}` : ''}`, {
    headers: EXPORT_TOKEN ? { 'Authorization': `Bearer ${EXPORT_TOKEN}` } : {},
  });
  
  return response.data;
}

export async function exportBets(params: { marketId?: string; from?: string; to?: string }) {
  const queryString = new URLSearchParams(
    Object.entries(params)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  
  const response = await request(`/export/bets.csv${queryString ? `?${queryString}` : ''}`, {
    headers: EXPORT_TOKEN ? { 'Authorization': `Bearer ${EXPORT_TOKEN}` } : {},
  });
  
  return response.data;
}

export async function exportReport(params: { from?: string; to?: string; minIrs?: number }) {
  const response = await api.post('/export/report.pdf', params);
  return response.data;
}

// Download helper
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
