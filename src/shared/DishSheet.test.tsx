import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { configureSiteKit } from '../config'
import { DishSheet } from './DishSheet'

function Harness({ imageKey = null, withFoot = true }: { imageKey?: string | null; withFoot?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Öppna</button>
      {open && (
        <DishSheet name="Lasagne" description={'Hemlagad\nmed bechamel'} imageKey={imageKey} imageFocus={{ x: 20, y: 80 }}
          allergens={['milk', 'gluten']} dietary={['vegetarian']} priceText="95 kr" onClose={() => setOpen(false)}>
          {withFoot && <button type="button">Klar</button>}
        </DishSheet>
      )}
    </>
  )
}

afterEach(() => configureSiteKit({ menuImageBaseUrl: '' }))

describe('DishSheet', () => {
  it('moves focus in, keeps Tab inside and gives focus back on Escape', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Öppna' })
    await user.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Lasagne' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const close = screen.getByRole('button', { name: 'Stäng' })
    expect(close).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Klar' })).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Klar' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('locks the page scroll while open and restores it on close', async () => {
    const user = userEvent.setup()
    document.documentElement.style.overflow = 'auto'
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    expect(document.documentElement.style.overflow).toBe('hidden')
    await user.click(screen.getByRole('button', { name: 'Stäng' }))
    expect(document.documentElement.style.overflow).toBe('auto')
    document.documentElement.style.overflow = ''
  })

  it('without an image shows the plate with the first letter, and the whole text', async () => {
    const user = userEvent.setup()
    configureSiteKit({ menuImageBaseUrl: 'https://cdn.test/' })
    render(<Harness withFoot={false} />)
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('img')).toBeNull()
    expect(dialog.querySelector('.plate-initial')).toHaveTextContent('L')
    expect(dialog).toHaveTextContent('Hemlagad')
    expect(screen.getByText('Vegetarisk')).toBeInTheDocument()
    expect(screen.getByText('Innehåller: Mjölk, Gluten')).toBeInTheDocument()
    expect(screen.getByText('95 kr')).toBeInTheDocument()
    expect(dialog.querySelector('.dish-sheet-foot')).toBeNull()
  })

  it('shows the photo at its focus point when the dish has one', async () => {
    const user = userEvent.setup()
    configureSiteKit({ menuImageBaseUrl: 'https://cdn.test/' })
    render(<Harness imageKey="menu-images/t/l/menu/lasagne.webp" />)
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    const img = screen.getByRole('img', { name: 'Lasagne' })
    expect(img).toHaveAttribute('src', 'https://cdn.test/menu-images/t/l/menu/lasagne.webp')
    expect(img.style.objectPosition).toBe('20% 80%')
  })
})
