export type AnnouncementSeverity = "info" | "warning" | "critical";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  linkUrl: string | null;
  isActive: boolean;
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdByAccountId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NewAnnouncement = Announcement;

export interface AnnouncementContent {
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  linkUrl: string | null;
  expiresAt: Date | null;
}
