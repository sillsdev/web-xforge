import { Component, OnInit } from '@angular/core';
import { SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import rightsByRole from 'realtime-server/lib/esm/scriptureforge/rightsByRole.json';
import { I18nService } from 'xforge-common/i18n.service';

const permissions = rightsByRole;

/**
 * This component provides a view of user permissions across the system
 * allowing administrators to review permission settings and roles.
 */
@Component({
    selector: 'app-permissions-viewer',
    templateUrl: './permissions-viewer.component.html',
    styleUrls: ['./permissions-viewer.component.scss'],
    standalone: false
})
export class PermissionsViewerComponent implements OnInit {
  // All available roles
  roles: string[] = [];

  // All available domains
  domains: string[] = [];

  // Define logical order for operations to ensure consistent display
  private readonly operationOrder: string[] = [
    'view',
    'view_own',
    'create',
    'edit',
    'edit_own',
    'delete',
    'delete_own'
  ];

  // Organized permissions data for display
  permissionsMatrix: {
    [role: string]: {
      [domain: string]: string[];
    };
  } = {};

  constructor(readonly i18n: I18nService) {}

  ngOnInit(): void {
    this.initializePermissionData();
  }

  /** Initialize the permissions data for display */
  private initializePermissionData(): void {
    // Get all roles from the permissions object
    this.roles = Object.keys(permissions).filter(role => role !== SFProjectRole.None);

    // Extract all unique domains from the SFProjectDomain enum
    this.domains = Object.values(SFProjectDomain);

    // Build the permissions matrix
    this.buildPermissionsMatrix();
  }

  /** Build a matrix of permissions for display */
  private buildPermissionsMatrix(): void {
    // Initialize the matrix
    for (const role of this.roles) {
      this.permissionsMatrix[role] = {};
      for (const domain of this.domains) {
        this.permissionsMatrix[role][domain] = [];
      }
    }

    // Fill the matrix with permissions
    // The rightsByRole structure is: { role: { domain: [operations] } }
    for (const role of this.roles) {
      const rolePermissions = permissions[role];
      if (rolePermissions !== undefined) {
        // Iterate through each domain in the role's permissions
        for (const [domain, operations] of Object.entries(rolePermissions)) {
          if (this.permissionsMatrix[role][domain] !== undefined && Array.isArray(operations)) {
            // Sort operations in a logical order before assigning
            this.permissionsMatrix[role][domain] = this.sortOperations(operations);
          }
        }
      }
    }
  }

  /** Get the permissions for a specific role and domain */
  getOperationsForRoleDomain(role: string, domain: string): string[] {
    return this.permissionsMatrix[role]?.[domain] || [];
  }

  /** Check if a specific role has a specific permission for a domain */
  hasOperation(role: string, domain: string, operation: string): boolean {
    const operations = this.getOperationsForRoleDomain(role, domain);
    return operations.includes(operation) === true;
  }

  /** Sort operations according to a predefined logical order */
  private sortOperations(operations: string[]): string[] {
    if (operations === undefined || operations.length === 0) {
      return [];
    }

    // Sort operations based on the defined order
    return [...operations].sort((a, b) => {
      const indexA = this.operationOrder.indexOf(a);
      const indexB = this.operationOrder.indexOf(b);

      // If an operation isn't found in our order array, put it at the end
      const posA = indexA !== -1 ? indexA : this.operationOrder.length;
      const posB = indexB !== -1 ? indexB : this.operationOrder.length;

      return posA - posB;
    });
  }
}
