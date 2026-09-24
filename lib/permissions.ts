export const permissionLabels = {
  request_correction:'Request receipt corrections (Super Admin approval required)',
  customers:'View customers',loans:'View loans',collections:'View collections',agents:'Monitor collection agents',reports:'View/export reports',reminders:'View/send reminders',
  create_customer:'Create customers',create_loan:'Create loans',create_agent:'Create collection agents',assign_customer:'Assign collection agents',
  update_customer:'Edit customers',update_loan:'Edit loans',update_agent:'Edit collection agents',delete_customers:'Delete cleared customers',delete_agent:'Archive collection agents',create_collection:'Record payments',
} as const;
export type Permission=keyof typeof permissionLabels;
export type ManagedRole='manager'|'agent';
export type Policy=Record<ManagedRole,Permission[]>;
export const allowedPermissions:Policy={manager:Object.keys(permissionLabels) as Permission[],agent:['customers','loans','collections','reports','reminders','create_collection']};
export const defaultPolicy:Policy={manager:['request_correction','customers','loans','collections','agents','reports','reminders','create_customer','create_loan','create_agent','assign_customer'],agent:[...allowedPermissions.agent]};
export const dependencies:Partial<Record<Permission,Permission[]>>={request_correction:['collections'],create_customer:['customers','agents'],create_loan:['loans','customers'],create_agent:['agents'],assign_customer:['customers','agents'],update_customer:['customers'],update_loan:['loans'],update_agent:['agents'],delete_customers:['customers'],delete_agent:['agents'],create_collection:['collections','loans','customers'],reports:['customers','loans','collections']};
export function validatePolicy(value:unknown):Policy {
  if(!value||typeof value!=='object')throw new Error('Invalid role permissions');
  const result={} as Policy;
  for(const role of ['manager','agent'] as const){
    const raw=(value as Record<string,unknown>)[role];
    if(!Array.isArray(raw)||raw.some(p=>!allowedPermissions[role].includes(p)))throw new Error('Invalid permissions for '+role);
    result[role]=Array.from(new Set(raw)) as Permission[];
    for(const p of result[role])for(const dependency of dependencies[p]||[])if(!result[role].includes(dependency))throw new Error(permissionLabels[p]+' requires '+permissionLabels[dependency]);
  }
  return result;
}
