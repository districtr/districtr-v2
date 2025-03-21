export const FROZEN_CONDITIONS = {
  checkedOut:
    'Checked Out:  Another user is actively editing this map.  You can choose to make a duplicate copy to edit, under a new PlanID, or you can wait and return to this later.',
  lockedWithPW:
    'Locked with Password:  Enter the password to continue editing this plan under its current ID, or you can choose to make a duplicate copy to edit under a new PlanID.',
  viewOnly:
    'View Only:  You can view this map, but you cannot edit it. Make a copy to duplicate the plan under a new PlanID.',
} as const;

export const STATUS_TEXT = {
  frozen: 'Status: Frozen',
  progress: 'Status: In Progress',
  ready: 'Status: Ready to Share',
} as const;
