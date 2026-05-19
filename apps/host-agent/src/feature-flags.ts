export interface FeatureFlag {
  id: string;
  enabled: boolean;
  rolloutPercentage: number;
  environments: string[];
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_FLAGS: Record<string, FeatureFlag> = {
  'relay-connections': {
    id: 'relay-connections',
    enabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  'direct-connections': {
    id: 'direct-connections',
    enabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  'scheduled-backups': {
    id: 'scheduled-backups',
    enabled: true,
    rolloutPercentage: 100,
    environments: ['development', 'staging', 'production'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  'mod-support': {
    id: 'mod-support',
    enabled: false,
    rolloutPercentage: 0,
    environments: ['development'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  'overlay-network': {
    id: 'overlay-network',
    enabled: false,
    rolloutPercentage: 0,
    environments: ['development'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  'multi-server': {
    id: 'multi-server',
    enabled: false,
    rolloutPercentage: 0,
    environments: ['development'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

export class FeatureFlags {
  private flags: Map<string, FeatureFlag>;
  private environment: string;

  constructor(environment: string = process.env.NODE_ENV || 'development') {
    this.environment = environment;
    this.flags = new Map(Object.entries(DEFAULT_FLAGS));
  }

  isEnabled(flagId: string, userId?: string): boolean {
    const flag = this.flags.get(flagId);
    if (!flag) return false;

    if (!flag.enabled) return false;

    if (!flag.environments.includes(this.environment)) return false;

    if (flag.rolloutPercentage >= 100) return true;
    if (flag.rolloutPercentage <= 0) return false;

    if (userId) {
      const hash = this.hashUserId(userId);
      return (hash % 100) < flag.rolloutPercentage;
    }

    return Math.random() * 100 < flag.rolloutPercentage;
  }

  getFlag(flagId: string): FeatureFlag | undefined {
    return this.flags.get(flagId);
  }

  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  setFlag(flagId: string, overrides: Partial<FeatureFlag>): void {
    const existing = this.flags.get(flagId);
    if (existing) {
      this.flags.set(flagId, {
        ...existing,
        ...overrides,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
