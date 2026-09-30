import * as THREE from 'three';
import { Sky, type SkyName } from './Sky.ts';
import { Court } from './Court.ts';
import { Net } from './Net.ts';
import { Stadium } from './Stadium.ts';
import { VENUES, type Venue } from './venues.ts';
import { Marks } from './Marks.ts';
import { Props } from './Props.ts';
import { Dust } from './Dust.ts';

/** everything static: sky, court, net, stadium (the crowd and people are added by the game) */
export class World {
  readonly scene = new THREE.Scene();
  readonly sky: Sky;
  court!: Court;
  net!: Net;
  stadium!: Stadium;
  props!: Props;
  readonly dust = new Dust();
  marks: Marks;
  venue: Venue;
  /** objects hidden while the environment map is captured (people, ball) */
  readonly dynamic: THREE.Object3D[] = [];

  constructor(readonly gl: THREE.WebGLRenderer, venueId = 'harbour') {
    this.venue = VENUES[venueId];
    this.sky = new Sky(this.scene, gl);
    this.marks = new Marks(gl);
  }

  async build(skyName?: SkyName) {
    await Promise.all([this.sky.load(), document.fonts.ready]);
    await Promise.all(['600 40px Inter', '500 40px "Cormorant Garamond"', 'italic 800 40px Inter', '300 40px Inter'].map((f) => document.fonts.load(f).catch(() => null)));
    this.court = new Court(this.venue, this.marks.texture);
    this.net = new Net();
    this.stadium = new Stadium(this.venue);
    this.props = new Props(this.venue);
    await Promise.all([this.court.load(), this.stadium.build(), this.sky.set(skyName ?? this.venue.sky), this.props.build()]);
    this.scene.add(this.court.mesh, this.net.group, this.stadium.group, this.props.group, this.dust.points);
    this.dust.color.set(this.venue.surface === 'clay' ? '#c67048' : this.venue.surface === 'grass' ? '#8a7a5a' : '#8a8a8a');
    this.dynamic.push(this.dust.points);
    for (const h of this.props.people) this.dynamic.push(h.root);
  }

  /** after everything is in the scene: capture the environment */
  finalize() {
    this.stadium.setLedLevel(this.sky.exposure, !!this.sky.preset.night);
    this.props.setLevel(this.sky.exposure);
    this.sky.captureEnv(this.dynamic);
  }

  async setSky(name: SkyName) {
    await this.sky.set(name);
    this.stadium.setLedLevel(this.sky.exposure, !!this.sky.preset.night);
    this.props.setLevel(this.sky.exposure);
    this.scene.environment = null;
    this.sky.captureEnv(this.dynamic);
  }

  readonly ballPos = new THREE.Vector3(0, 1, 0);
  update(dt: number, t: number) {
    this.net.update(dt);
    this.stadium.update(t);
    this.props.update(dt, this.ballPos);
    this.dust.setLight((this.sky.horizontal / Math.PI) * 0.7);
    this.dust.update(dt);
  }
}
