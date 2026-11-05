'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer data-[state=checked]:bg-accent-yellow data-[state=unchecked]:bg-neutral-800 dark:data-[state=unchecked]:bg-neutral-800 border data-[state=checked]:border-accent-yellow data-[state=unchecked]:border-neutral-600 dark:data-[state=unchecked]:border-neutral-500 focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 shadow-sm transition-all outline-none focus-visible:ring-[2px] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={
          'bg-white data-[state=checked]:bg-black pointer-events-none block size-3.5 rounded-full shadow-md ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0'
        }
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
