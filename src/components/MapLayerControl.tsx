import { Button, Popover } from '@heroui/react';
import { useState } from 'react';
import { MAP_LAYERS, type MapLayer } from '../state/mapLayer';

function LayerThumbnail({ layer }: { layer: MapLayer }) {
  const water = 'var(--layer-preview-water, var(--map-water))';
  const land = 'var(--layer-preview-land, var(--map-land))';
  const road = 'var(--layer-preview-road, var(--map-road))';
  const park = 'var(--layer-preview-park, var(--surface-secondary))';
  const block = 'var(--layer-preview-block, var(--map-border))';
  return (
    <svg
      className={`map-layer-thumbnail map-layer-thumbnail--${layer}`}
      viewBox="0 0 112 66"
      width="112"
      height="66"
      aria-hidden="true"
      focusable="false"
    >
      {layer === 'satellite' ? (
        <>
          <rect width="112" height="66" fill="var(--layer-preview-imagery-land, #526247)" />
          <path
            d="M0 0h40L27 22 0 17Zm46 0h39L67 26 34 22ZM0 23l26 5-8 25L0 49Zm34 6 31 5-10 30-32-7Zm39 2 39 10v25H61Z"
            fill="var(--layer-preview-imagery-field, #778064)"
          />
          <path
            d="m84 0 28 0v28l-20 6-13-10-12-7ZM0 52l18 6-2 8H0Z"
            fill="var(--layer-preview-imagery-forest, #344c3a)"
          />
          <path
            d="M20-5C47 9 33 20 59 29s17 21 52 36l9 7C75 62 69 43 48 37S37 12 12-5Z"
            fill="var(--layer-preview-imagery-water, #243d48)"
          />
          <path
            d="M-5 42 25 42 73 13 119 15M28 69 45 38 75 38 112 56"
            fill="none"
            stroke="var(--layer-preview-imagery-road, #b7b4a1)"
            strokeWidth="1.3"
          />
        </>
      ) : (
        <>
          <rect width="112" height="66" fill={land} />
          {layer === 'atlas' && (
            <>
              <path d="M5 5h24v18H5Zm73 35h27v23H78Z" fill={park} />
              <path d="M35 5h17v15H35Zm-30 27h16v12H5Zm78-27h25v15H83Z" fill={block} />
            </>
          )}
          {layer === 'blueprint' && (
            <path
              d="M16 0v66M32 0v66M48 0v66M64 0v66M80 0v66M96 0v66M0 16h112M0 32h112M0 48h112M0 64h112"
              fill="none"
              stroke="var(--layer-preview-grid, var(--map-border))"
              strokeWidth="0.5"
              opacity="0.65"
            />
          )}
          <path
            d="M40-6C62 9 35 24 63 34S70 58 98 72H77C51 60 61 46 42 36S44 9 23-6Z"
            fill={water}
            stroke={layer === 'blueprint' ? road : 'none'}
            strokeWidth="0.8"
          />
          <path
            d={
              layer === 'blueprint'
                ? 'M-4 48h25l35-30h60M8-4v30l28 27h76M76-4v36l-24 34'
                : 'M-4 46C28 50 34 30 58 20s32-1 58-5M10-4c7 30 33 56 62 72M78-4c-5 30 14 37 38 43'
            }
            fill="none"
            stroke={road}
            strokeWidth={layer === 'minimal' ? '1' : '1.6'}
          />
          {layer === 'atlas' && (
            <g fill={road}>
              <rect x="7" y="53" width="20" height="2" rx="1" />
              <rect x="79" y="25" width="22" height="2" rx="1" />
            </g>
          )}
          {layer === 'blueprint' && (
            <g fill={land} stroke={road} strokeWidth="1">
              <circle cx="56" cy="18" r="2.5" />
              <circle cx="76" cy="32" r="2.5" />
            </g>
          )}
        </>
      )}
    </svg>
  );
}

export function MapLayerControl({
  layer,
  onChange,
}: {
  layer: MapLayer;
  onChange: (next: MapLayer) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="map-layer-control">
      <Popover isOpen={open} onOpenChange={setOpen}>
        <Button
          className="map-layer-trigger map-control-button"
          variant="secondary"
          isIconOnly
          aria-label="Choose map layer"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />
          </svg>
        </Button>
        <Popover.Content className="map-layer-popover" placement="left bottom" offset={10}>
          <Popover.Dialog className="map-layer-dialog">
            <Popover.Heading>Map layer</Popover.Heading>
            <div className="map-layer-grid" role="group" aria-label="Map layers">
              {MAP_LAYERS.map((option) => (
                <Button
                  key={option.id}
                  className="map-layer-option"
                  variant="ghost"
                  aria-label={option.name}
                  aria-pressed={layer === option.id}
                  onPress={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <LayerThumbnail layer={option.id} />
                  <span className="map-layer-option-label">
                    {option.name}
                    {layer === option.id && (
                      <svg
                        className="map-layer-selected"
                        width="13"
                        height="13"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="m3 8 3 3 7-7" />
                      </svg>
                    )}
                  </span>
                  <span className="map-layer-option-description">{option.description}</span>
                </Button>
              ))}
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}
