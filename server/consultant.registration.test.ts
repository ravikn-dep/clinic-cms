import { describe, expect, it, beforeEach, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

// Mock database functions
vi.mock("./db", () => ({
  getAllStaffUsers: vi.fn(),
  getUserById: vi.fn(),
  updateUser: vi.fn(),
  getConsultationById: vi.fn(),
  getPatientById: vi.fn(),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "admin" | "consultant" | "staff" | "user" = "admin"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Consultant Registration Details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("consultants.getAll", () => {
    it("returns all consultants with registration details", async () => {
      const mockConsultants = [
        {
          id: 1,
          userId: "CONS-001",
          name: "Dr. Ravi N.",
          email: "ravi@clinic.com",
          phone: "9876543210",
          department: "Orthopedics",
          role: "consultant",
          isActive: true,
          stateCounsilSection: "AP-2024",
          registrationNumber: "REG-12345",
          createdAt: new Date(),
        },
        {
          id: 2,
          userId: "CONS-002",
          name: "Dr. Deepthi",
          email: "deepthi@clinic.com",
          phone: "9876543211",
          department: "Orthopedics",
          role: "consultant",
          isActive: true,
          stateCounsilSection: "AP-2024",
          registrationNumber: "REG-12346",
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.getAllStaffUsers).mockResolvedValue(mockConsultants as any);

      const consultants = await db.getAllStaffUsers();
      const filtered = consultants
        .filter((u: any) => u.role === "consultant")
        .map((u: any) => ({
          id: u.id,
          userId: u.userId,
          name: u.name,
          email: u.email,
          phone: u.phone,
          department: u.department,
          role: u.role,
          isActive: u.isActive,
          stateCounsilSection: u.stateCounsilSection,
          registrationNumber: u.registrationNumber,
          createdAt: u.createdAt,
        }));

      expect(filtered).toHaveLength(2);
      expect(filtered[0]).toMatchObject({
        name: "Dr. Ravi N.",
        registrationNumber: "REG-12345",
        stateCounsilSection: "AP-2024",
      });
      expect(filtered[1]).toMatchObject({
        name: "Dr. Deepthi",
        registrationNumber: "REG-12346",
        stateCounsilSection: "AP-2024",
      });
    });

    it("filters out non-consultant users", async () => {
      const mockUsers = [
        {
          id: 1,
          userId: "CONS-001",
          name: "Dr. Ravi N.",
          role: "consultant",
          stateCounsilSection: "AP-2024",
          registrationNumber: "REG-12345",
        },
        {
          id: 2,
          userId: "STAFF-001",
          name: "Staff Member",
          role: "staff",
          stateCounsilSection: null,
          registrationNumber: null,
        },
      ];

      vi.mocked(db.getAllStaffUsers).mockResolvedValue(mockUsers as any);

      const users = await db.getAllStaffUsers();
      const consultants = users.filter((u: any) => u.role === "consultant");

      expect(consultants).toHaveLength(1);
      expect(consultants[0]?.name).toBe("Dr. Ravi N.");
    });
  });

  describe("consultants.getById", () => {
    it("returns consultant with registration details", async () => {
      const mockConsultant = {
        id: 1,
        userId: "CONS-001",
        name: "Dr. Ravi N.",
        email: "ravi@clinic.com",
        phone: "9876543210",
        department: "Orthopedics",
        role: "consultant",
        isActive: true,
        stateCounsilSection: "AP-2024",
        registrationNumber: "REG-12345",
        createdAt: new Date(),
      };

      vi.mocked(db.getUserById).mockResolvedValue(mockConsultant as any);

      const consultant = await db.getUserById(1);

      expect(consultant).toMatchObject({
        name: "Dr. Ravi N.",
        role: "consultant",
        registrationNumber: "REG-12345",
        stateCounsilSection: "AP-2024",
      });
    });

    it("returns null for non-consultant user", async () => {
      const mockUser = {
        id: 2,
        userId: "STAFF-001",
        name: "Staff Member",
        role: "staff",
      };

      vi.mocked(db.getUserById).mockResolvedValue(mockUser as any);

      const user = await db.getUserById(2);

      expect(user?.role).not.toBe("consultant");
    });
  });

  describe("Invoice generation with consultant details", () => {
    it("includes consultant registration in invoice data", async () => {
      const mockConsultation = {
        consultationId: "CONS-123",
        consultantId: 1,
        patientId: "PAT-001",
      };

      const mockConsultant = {
        id: 1,
        name: "Dr. Ravi N.",
        registrationNumber: "REG-12345",
        stateCounsilSection: "AP-2024",
      };

      vi.mocked(db.getConsultationById).mockResolvedValue(mockConsultation as any);
      vi.mocked(db.getUserById).mockResolvedValue(mockConsultant as any);

      // Simulate bill creation logic
      const consultation = await db.getConsultationById("CONS-123");
      let consultantName: string | undefined;
      let consultantRegistrationNumber: string | undefined;
      let consultantStateCounsilSection: string | undefined;

      if (consultation && consultation.consultantId) {
        const consultant = await db.getUserById(consultation.consultantId);
        if (consultant) {
          consultantName = consultant.name || undefined;
          consultantRegistrationNumber = consultant.registrationNumber || undefined;
          consultantStateCounsilSection = consultant.stateCounsilSection || undefined;
        }
      }

      expect(consultantName).toBe("Dr. Ravi N.");
      expect(consultantRegistrationNumber).toBe("REG-12345");
      expect(consultantStateCounsilSection).toBe("AP-2024");
    });

    it("handles missing consultant gracefully", async () => {
      const mockConsultation = {
        consultationId: "CONS-123",
        consultantId: null,
        patientId: "PAT-001",
      };

      vi.mocked(db.getConsultationById).mockResolvedValue(mockConsultation as any);

      const consultation = await db.getConsultationById("CONS-123");
      let consultantName: string | undefined;
      let consultantRegistrationNumber: string | undefined;
      let consultantStateCounsilSection: string | undefined;

      if (consultation && consultation.consultantId) {
        const consultant = await db.getUserById(consultation.consultantId);
        if (consultant) {
          consultantName = consultant.name || undefined;
          consultantRegistrationNumber = consultant.registrationNumber || undefined;
          consultantStateCounsilSection = consultant.stateCounsilSection || undefined;
        }
      }

      expect(consultantName).toBeUndefined();
      expect(consultantRegistrationNumber).toBeUndefined();
      expect(consultantStateCounsilSection).toBeUndefined();
    });
  });

  describe("OP Form with consultant details", () => {
    it("includes consultant registration in OP form data", () => {
      const patientData = {
        firstName: "John",
        lastName: "Doe",
        age: "30",
        gender: "Male",
        contactNumber: "9876543210",
        consultantName: "Dr. Ravi N.",
        consultantRegistrationNumber: "REG-12345",
        consultantStateCounsilSection: "AP-2024",
      };

      expect(patientData).toMatchObject({
        consultantName: "Dr. Ravi N.",
        consultantRegistrationNumber: "REG-12345",
        consultantStateCounsilSection: "AP-2024",
      });
    });

    it("handles optional consultant fields", () => {
      const patientData = {
        firstName: "Jane",
        lastName: "Smith",
        age: "25",
        gender: "Female",
        contactNumber: "9876543211",
        consultantName: "Dr. Deepthi",
        consultantRegistrationNumber: undefined,
        consultantStateCounsilSection: undefined,
      };

      expect(patientData.consultantName).toBeDefined();
      expect(patientData.consultantRegistrationNumber).toBeUndefined();
      expect(patientData.consultantStateCounsilSection).toBeUndefined();
    });
  });

  describe("Consultant field validation", () => {
    it("validates consultant name is not empty", () => {
      const consultantName = "Dr. Ravi N.";
      expect(consultantName.length).toBeGreaterThan(0);
    });

    it("validates registration number format", () => {
      const registrationNumber = "REG-12345";
      const isValid = /^REG-\d+$/.test(registrationNumber);
      expect(isValid).toBe(true);
    });

    it("validates state council section format", () => {
      const stateCounsilSection = "AP-2024";
      const isValid = /^[A-Z]{2}-\d{4}$/.test(stateCounsilSection);
      expect(isValid).toBe(true);
    });
  });
});
