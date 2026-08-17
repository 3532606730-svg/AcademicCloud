import type { Announcement, AnnouncementContent, NewAnnouncement } from "./announcement.js";

export interface AnnouncementRepository {
  create(announcement: NewAnnouncement): Announcement;
  findById(id: string): Announcement | null;
  listAll(): Announcement[];
  listEffective(now: Date): Announcement[];
  updateContent(id: string, content: AnnouncementContent, updatedAt: Date): boolean;
  publish(id: string, publishedAt: Date): boolean;
  unpublish(id: string, updatedAt: Date): boolean;
  delete(id: string): boolean;
}
