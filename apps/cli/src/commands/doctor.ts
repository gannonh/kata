export function renderDoctorReport(input: {
  packageVersion: string;
  backendConfigStatus: "ok" | "invalid";
  backendConfigMessage: string;
  harness: string;
}) {
  return {
    summary: `kata doctor ${input.backendConfigStatus} (${input.harness})`,
    checks: [
      {
        name: "backend-config",
        status: input.backendConfigStatus,
        message: input.backendConfigMessage,
      },
    ],
  };
}
