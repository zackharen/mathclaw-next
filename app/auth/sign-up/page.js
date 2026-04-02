import { listSchoolOptions } from "@/lib/schools";
import SignUpForm from "./sign-up-form";

export default async function SignUpPage() {
  let schoolOptions = [];

  try {
    schoolOptions = await listSchoolOptions();
  } catch {
    schoolOptions = [];
  }

  return <SignUpForm schoolOptions={schoolOptions} />;
}
