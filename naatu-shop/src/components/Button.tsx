import type { ButtonHTMLAttributes } from 'react'
import { forwardRef } from 'react'

export type ButtonVariant = 
  | 'primary' 
  | 'secondary' 
  | 'tertiary' 
  | 'ghost' 
  | 'danger' 
  | 'success' 
  | 'outline'
  | 'black'

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'px-2.5 py-1.5 rounded-lg text-[11px] font-black',
  sm: 'px-3 py-2 rounded-xl text-xs font-bold',
  md: 'px-5 py-2.5 rounded-xl text-sm font-bold',
  lg: 'px-6 py-3 rounded-xl text-base font-bold',
  xl: 'px-8 py-4 rounded-2xl text-lg font-black',
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white border-2 border-primary shadow-button hover:bg-primary-dark hover:border-primary-dark hover:shadow-button-hover',
  secondary: 'bg-white text-primary border-2 border-primary shadow-soft hover:bg-purple-50 hover:border-primary-dark hover:shadow-card',
  tertiary: 'bg-transparent text-primary border-2 border-transparent hover:bg-purple-50 hover:border-purple-200',
  ghost: 'bg-transparent text-textMuted border-2 border-transparent hover:bg-gray-100 hover:text-textMain',
  danger: 'bg-error text-white border-2 border-error shadow-[0_2px_4px_rgba(239,68,68,0.2)] hover:bg-red-600 hover:border-red-700 hover:shadow-[0_4px_8px_rgba(239,68,68,0.3)]',
  success: 'bg-success text-white border-2 border-success shadow-[0_2px_4px_rgba(16,185,129,0.2)] hover:bg-emerald-600 hover:border-emerald-700 hover:shadow-[0_4px_8px_rgba(16,185,129,0.3)]',
  outline: 'bg-white text-textMain border-2 border-textMuted shadow-soft hover:bg-gray-50 hover:border-textMain hover:shadow-card',
  black: 'bg-black text-white border-2 border-black hover:bg-gray-900 hover:border-gray-900',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      loading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      className = '',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        type={props.type || 'button'}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center gap-2
          font-sans
          transition-all duration-200 ease-out
          focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2
          active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!loading && leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
        <span className={loading ? 'opacity-0' : ''}>{children}</span>
        {!loading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button