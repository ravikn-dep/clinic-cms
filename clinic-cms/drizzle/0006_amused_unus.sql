CREATE TABLE `appointments` (
	`appointmentId` varchar(50) NOT NULL,
	`patientId` varchar(50) NOT NULL,
	`consultantId` int NOT NULL,
	`appointmentDate` varchar(10) NOT NULL,
	`appointmentTime` varchar(5) NOT NULL,
	`duration` int DEFAULT 30,
	`status` enum('Scheduled','Completed','Cancelled','No-show','Rescheduled') DEFAULT 'Scheduled',
	`notes` text,
	`reminderSent` boolean DEFAULT false,
	`reminderSentAt` timestamp,
	`notificationMethod` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_appointmentId` PRIMARY KEY(`appointmentId`)
);
--> statement-breakpoint
CREATE TABLE `consultantAvailability` (
	`availabilityId` varchar(50) NOT NULL,
	`consultantId` int NOT NULL,
	`dayOfWeek` int NOT NULL,
	`startTime` varchar(5) NOT NULL,
	`endTime` varchar(5) NOT NULL,
	`slotDuration` int DEFAULT 30,
	`maxAppointmentsPerDay` int DEFAULT 10,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consultantAvailability_availabilityId` PRIMARY KEY(`availabilityId`)
);
--> statement-breakpoint
CREATE TABLE `notificationPreferences` (
	`preferenceId` varchar(50) NOT NULL,
	`patientId` varchar(50) NOT NULL,
	`appointmentReminders` boolean DEFAULT true,
	`reminderMethod` enum('SMS','Email','Both') DEFAULT 'SMS',
	`billingNotifications` boolean DEFAULT true,
	`followUpNotifications` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationPreferences_preferenceId` PRIMARY KEY(`preferenceId`)
);
