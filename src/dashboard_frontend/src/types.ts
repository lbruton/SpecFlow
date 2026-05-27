export interface AutomationJob {
  id: string;
  name: string;
  type: 'cleanup-approvals' | 'cleanup-specs' | 'cleanup-archived-specs';
  enabled: boolean;
  config: {
    daysOld: number;
  };
  schedule: string;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

export interface ImplementationLogEntry {
  id: string;
  taskId: string;
  timestamp: string;
  summary: string;
  filesModified: string[];
  filesCreated: string[];
  statistics: {
    linesAdded: number;
    linesRemoved: number;
    filesChanged: number;
  };
  artifacts: {
    apiEndpoints?: {
      method: string;
      path: string;
      purpose: string;
      requestFormat?: string;
      responseFormat?: string;
      location: string;
    }[];
    components?: {
      name: string;
      type: string;
      purpose: string;
      location: string;
      props?: string;
      exports?: string[];
    }[];
    functions?: {
      name: string;
      purpose: string;
      location: string;
      signature?: string;
      isExported: boolean;
    }[];
    classes?: {
      name: string;
      purpose: string;
      location: string;
      methods?: string[];
      isExported: boolean;
    }[];
    integrations?: {
      description: string;
      frontendComponent: string;
      backendEndpoint: string;
      dataFlow: string;
    }[];
    tests?: {
      name: string;
      type: string;
      framework: string;
      location: string;
      status: string;
      passed: number;
      failed: number;
      total: number;
      duration?: string;
      coveragePercent?: number;
      userStories?: string[];
    }[];
  };
}
