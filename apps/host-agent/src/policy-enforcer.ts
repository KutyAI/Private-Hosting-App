import * as fs from 'fs';
import * as path from 'path';
import { AccessPolicy } from '@mc-host/shared-types';

export interface AccessRule {
  serverId: string;
  allowedDeviceIds: Set<string>;
  inviteCodes: Set<string>;
  isWhitelistEnabled: boolean;
  maxConcurrentPlayers: number;
  bannedDeviceIds: Set<string>;
}

export class PolicyEnforcer {
  private policies: Map<string, AccessPolicy> = new Map();
  private rules: Map<string, AccessRule> = new Map();
  private policiesPath: string;

  constructor(dataDir: string) {
    this.policiesPath = path.join(dataDir, 'config', 'policies.json');
    this.loadPolicies();
  }

  loadPolicies(): void {
    try {
      if (fs.existsSync(this.policiesPath)) {
        const data = JSON.parse(fs.readFileSync(this.policiesPath, 'utf-8'));
        for (const [key, policy] of Object.entries(data)) {
          this.policies.set(key, policy as AccessPolicy);
        }
      }
    } catch {}
  }

  savePolicies(): void {
    const obj: Record<string, AccessPolicy> = {};
    for (const [key, policy] of this.policies) {
      obj[key] = policy;
    }
    fs.writeFileSync(this.policiesPath, JSON.stringify(obj, null, 2));
  }

  setPolicy(serverId: string, policy: AccessPolicy): void {
    this.policies.set(serverId, policy);
    this.savePolicies();

    if (!this.rules.has(serverId)) {
      this.rules.set(serverId, {
        serverId,
        allowedDeviceIds: new Set(),
        inviteCodes: new Set(),
        isWhitelistEnabled: policy.whitelist_enabled,
        maxConcurrentPlayers: 20,
        bannedDeviceIds: new Set(),
      });
    } else {
      const rule = this.rules.get(serverId)!;
      rule.isWhitelistEnabled = policy.whitelist_enabled;
    }
  }

  getPolicy(serverId: string): AccessPolicy | null {
    return this.policies.get(serverId) || null;
  }

  addAllowedDevice(serverId: string, deviceId: string): void {
    const rule = this.getOrCreateRule(serverId);
    rule.allowedDeviceIds.add(deviceId);
  }

  removeAllowedDevice(serverId: string, deviceId: string): void {
    const rule = this.rules.get(serverId);
    rule?.allowedDeviceIds.delete(deviceId);
  }

  addInviteCode(serverId: string, code: string): void {
    const rule = this.getOrCreateRule(serverId);
    rule.inviteCodes.add(code);
  }

  removeInviteCode(serverId: string, code: string): void {
    const rule = this.rules.get(serverId);
    rule?.inviteCodes.delete(code);
  }

  banDevice(serverId: string, deviceId: string): void {
    const rule = this.getOrCreateRule(serverId);
    rule.bannedDeviceIds.add(deviceId);
    rule.allowedDeviceIds.delete(deviceId);
  }

  unbanDevice(serverId: string, deviceId: string): void {
    const rule = this.rules.get(serverId);
    rule?.bannedDeviceIds.delete(deviceId);
  }

  canConnect(serverId: string, deviceId: string, inviteCode?: string): boolean {
    const policy = this.policies.get(serverId);
    if (!policy) return true;

    const rule = this.rules.get(serverId);
    if (!rule) return true;

    if (rule.bannedDeviceIds.has(deviceId)) {
      return false;
    }

    if (rule.allowedDeviceIds.has(deviceId)) {
      return true;
    }

    if (policy.invite_only) {
      if (inviteCode && rule.inviteCodes.has(inviteCode)) {
        return true;
      }
      return false;
    }

    if (policy.whitelist_enabled) {
      return false;
    }

    return true;
  }

  getActiveRules(serverId: string): AccessRule | null {
    const rule = this.rules.get(serverId);
    if (!rule) return null;

    return {
      ...rule,
      allowedDeviceIds: new Set(rule.allowedDeviceIds),
      inviteCodes: new Set(rule.inviteCodes),
      bannedDeviceIds: new Set(rule.bannedDeviceIds),
    };
  }

  private getOrCreateRule(serverId: string): AccessRule {
    if (!this.rules.has(serverId)) {
      const policy = this.policies.get(serverId);
      this.rules.set(serverId, {
        serverId,
        allowedDeviceIds: new Set(),
        inviteCodes: new Set(),
        isWhitelistEnabled: policy?.whitelist_enabled || false,
        maxConcurrentPlayers: 20,
        bannedDeviceIds: new Set(),
      });
    }
    return this.rules.get(serverId)!;
  }
}
