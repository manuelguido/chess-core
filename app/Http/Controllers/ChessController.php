<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;

class ChessController extends Controller
{
    public function __invoke(): Response
    {
        return Inertia::render('Chess/Index', [
            'botProfiles' => [
                ['name' => 'Opening Rookie', 'elo' => 800, 'style' => 'Loose', 'depth' => 1],
                ['name' => 'Club Grinder', 'elo' => 1200, 'style' => 'Material', 'depth' => 1],
                ['name' => 'Tactical Analyst', 'elo' => 1700, 'style' => 'Sharp', 'depth' => 2],
                ['name' => 'Candidate Engine', 'elo' => 2300, 'style' => 'Positional', 'depth' => 2],
                ['name' => 'Grandmaster Core', 'elo' => 3000, 'style' => 'Precise', 'depth' => 3],
            ],
        ]);
    }
}
