"use client";

import { forwardRef, type ComponentProps, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;
export const SheetPortal = Dialog.Portal;

const sheetVariants = cva("fixed z-50 overflow-y-auto bg-background p-6 text-foreground shadow-xl focus:outline-none", {
  variants: {
    side: {
      right: "inset-y-0 right-0 h-dvh w-full max-w-md border-l",
      left: "inset-y-0 left-0 h-dvh w-full max-w-md border-r",
      top: "inset-x-0 top-0 max-h-[90dvh] border-b",
      bottom: "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-xl border-t",
    },
  },
  defaultVariants: { side: "right" },
});

export const SheetOverlay = forwardRef<ComponentRef<typeof Dialog.Overlay>, ComponentPropsWithoutRef<typeof Dialog.Overlay>>(function SheetOverlay(
  { className, ...props }, ref,
) {
  return <Dialog.Overlay ref={ref} data-slot="sheet-overlay" className={cn("fixed inset-0 z-40 bg-black/50", className)} {...props} />;
});

export type SheetContentProps = ComponentPropsWithoutRef<typeof Dialog.Content> & VariantProps<typeof sheetVariants>;

export const SheetContent = forwardRef<ComponentRef<typeof Dialog.Content>, SheetContentProps>(function SheetContent(
  { side = "right", className, children, ...props }, ref,
) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <Dialog.Content ref={ref} data-slot="sheet-content" className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        <Dialog.Close type="button" aria-label="Закрыть" className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X aria-hidden="true" className="size-5" />
        </Dialog.Close>
      </Dialog.Content>
    </SheetPortal>
  );
});

export function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("mb-6 flex flex-col gap-2 pr-10", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end", className)} {...props} />;
}

export const SheetTitle = forwardRef<ComponentRef<typeof Dialog.Title>, ComponentPropsWithoutRef<typeof Dialog.Title>>(function SheetTitle(
  { className, ...props }, ref,
) {
  return <Dialog.Title ref={ref} data-slot="sheet-title" className={cn("text-xl font-semibold leading-tight", className)} {...props} />;
});

export const SheetDescription = forwardRef<ComponentRef<typeof Dialog.Description>, ComponentPropsWithoutRef<typeof Dialog.Description>>(function SheetDescription(
  { className, ...props }, ref,
) {
  return <Dialog.Description ref={ref} data-slot="sheet-description" className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />;
});
