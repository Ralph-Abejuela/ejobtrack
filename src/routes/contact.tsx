import LinkedIn from "@/components/LinkedIn";
import { createFileRoute } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";
import { siGithub } from "simple-icons";

export const Route = createFileRoute("/contact")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full">
      <span className="font-normal tracking-wide text-2xl pb-2">Made by: </span>
      <div className="p-4 grid grid-cols-[auto_1fr] gap-4 border rounded-md shadow-2xl from-card  to-accent bg-linear-to-br ">
        <div>
          <img
            src="/ProfilePic.jpg"
            className="aspect-square rounded-md h-34"
          />
        </div>
        <div className="grid grid-cols-1 grid-rows-[1fr_auto]">
          <div>
            <span className="font-bold tracking-wide text-2xl">
              Ralph Luis B. Abejuela
            </span>
            <br />
            <a
              href="mailto:abejuela.ralph.balatucan@gmail.com"
              className="font-light hover:underline md:block hidden"
            >
              abejuela.ralph.balatucan@gmail.com
            </a>
          </div>
          <div className="flex gap-2 pt-4">
            <a
              href="https://linkedin.com/in/ralph-abejuela"
              target="_blank"
              rel="noopener noreferrer"
            >
              <LinkedIn className="size-10 fill-current" fill="" />
            </a>
            <a
              href="https://github.com/Ralph-Abejuela"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                viewBox="-2 -2 29 29"
                className="p-1 size-10 fill-current"
                aria-hidden="true"
              >
                <path d={siGithub.path} />
              </svg>
            </a>
            <a>
              <MailIcon className="size-10 p-0.5 pb-1 stroke-1" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
